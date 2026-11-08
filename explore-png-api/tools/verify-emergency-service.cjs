const expectedUrl = 'postgresql://ci@127.0.0.1:54330/joyride_safety_ci?schema=public';
if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.JOYRIDE_SAFETY_DB_TEST !== '1' || process.env.DATABASE_URL !== expectedUrl) {
  console.error('REFUSED: emergency service tests require the dedicated safety database job.');
  process.exit(1);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
require('reflect-metadata');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { EmergenciesService } = require('../dist/src/emergencies/emergencies.service');
const { NotificationsService } = require('../dist/src/notifications/notifications.service');
const { ConflictException, NotFoundException, UnauthorizedException } = require('@nestjs/common');
const { Client } = require('pg');

module.exports = async function verifyEmergencyService() {
  const db = new PrismaService();
  const control = new Client({ connectionString: expectedUrl });
  const service = new EmergenciesService(db);
  const notifications = new NotificationsService(db);
  let stage = 'connect disposable emergency test database';
  let count = 0;
  async function check(name, fn) { stage = name; await fn(); count++; console.log(`PASS: ${name}`); }
  async function fixture() {
    const driver = await db.driver.create({data: {fullName: 'CI emergency driver', phone: randomUUID(), status: 'APPROVED', isAuthActive: true}});
    const other = await db.driver.create({data: {fullName: 'Other driver', phone: randomUUID(), status: 'APPROVED', isAuthActive: true}});
    const ride = await db.ride.create({data: {driverId: driver.id, status: 'IN_PROGRESS'}});
    const admin = await db.adminAccount.create({data: {fullName: 'CI emergency Admin', email: randomUUID(), passwordHash: 'test-only', isActive: true}});
    const second = await db.adminAccount.create({data: {fullName: 'Second Admin', email: randomUUID(), passwordHash: 'test-only', isActive: true}});
    return {driver, other, ride, admin, second};
  }
  async function race(kind, id, calls) {
    await control.query('BEGIN');
    let pending;
    try {
      if (kind === 'create') await control.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`joyride:driver-emergency:${id}`]);
      else await control.query('SELECT id FROM "DriverEmergencyAlert" WHERE id=$1 FOR UPDATE', [id]);
      pending = Promise.allSettled(calls.map(fn => Promise.resolve().then(fn)));
      const deadline = Date.now() + 6000;
      let waiters = 0;
      do {
        await control.query('SELECT pg_stat_clear_snapshot()');
        const result = await control.query(`SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`);
        waiters = result.rows[0].n;
        if (waiters >= calls.length) break;
        await delay(25);
      } while (Date.now() < deadline);
      assert(waiters >= calls.length, 'LOCK_CONTENTION_NOT_OBSERVED');
      await control.query('COMMIT');
      return await pending;
    } finally {
      await control.query('ROLLBACK');
      if (pending) await pending;
    }
  }
  try {
    await db.onModuleInit(); await control.connect();
    stage = 'apply additive location provenance migration to disposable fixture only';
    await control.query(fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261002000000_add_emergency_location_source/migration.sql'), 'utf8'));
    await check('GPS and selected-pin provenance persist; retry preserves original incident location', async () => {
      const f = await fixture();
      const clientRequestId = randomUUID();
      const recordedAt = new Date().toISOString();
      const first = await service.create(f.driver.id, {clientRequestId, location: {
        source: 'MANUAL_PIN', latitude: -9.44, longitude: 147.18, accuracyMeters: 10, recordedAt,
      }});
      assert.equal(first.locationSource, 'MANUAL_PIN'); assert.equal(first.accuracyMeters, null);
      const retry = await service.create(f.driver.id, {clientRequestId, location: {
        source: 'GPS', latitude: -9.45, longitude: 147.19, recordedAt,
      }});
      assert.equal(retry.id, first.id); assert.equal(retry.latitude, first.latitude);
      assert.equal(retry.locationSource, 'MANUAL_PIN');
      const admin = await service.getAdmin(first.id);
      assert.equal(admin.locationSource, 'MANUAL_PIN');
      const gps = await service.create(f.driver.id, {clientRequestId: randomUUID(), location: {
        source: 'GPS', latitude: -9.43, longitude: 147.17, accuracyMeters: 8, recordedAt,
      }});
      assert.equal(gps.locationSource, 'GPS'); assert.equal(gps.accuracyMeters, 8);
      const legacy = await service.create(f.driver.id, {clientRequestId: randomUUID(), location: {
        latitude: -9.43, longitude: 147.17, recordedAt,
      }});
      assert.equal(legacy.locationSource, null);
      await assert.rejects(() => control.query('UPDATE "DriverEmergencyAlert" SET "accuracyMeters"=5 WHERE id=$1', [first.id]), e => e.code === '23514');
      await assert.rejects(() => control.query('UPDATE "DriverEmergencyAlert" SET latitude=NULL, longitude=NULL, "locationRecordedAt"=NULL WHERE id=$1', [first.id]), e => e.code === '23514');
    });

    await check('Concurrent alert retries persist one alert, audit event and inbox item per active Admin', async () => {
      const f = await fixture();
      const dto = {clientRequestId: randomUUID(), rideId: f.ride.id, message: ' Need help '};
      const inactive = await db.adminAccount.create({data: {fullName: 'Inactive Admin', email: randomUUID(), passwordHash: 'test-only', isActive: false}});
      const active = await db.adminAccount.count({where: {isActive: true}});
      const result = await race('create', f.driver.id, [() => service.create(f.driver.id, dto), () => service.create(f.driver.id, dto)]);
      assert(result.every(r => r.status === 'fulfilled'));
      const a = result[0].value;
      assert.equal(a.id, result[1].value.id); assert.equal(a.adminInboxItemCount, active);
      assert.equal(a.humanAcknowledged, false); assert.equal(a.serverReceived, true);
      assert.equal(await db.driverEmergencyAlert.count({where: {driverId: f.driver.id}}), 1);
      assert.equal(await db.emergencyAlertEvent.count({where: {alertId: a.id}}), 1);
      assert.equal(await db.notificationInboxItem.count({where: {emergencyAlertId: a.id}}), active);
      assert.equal(await db.notificationInboxItem.count({where: {emergencyAlertId: a.id, adminId: inactive.id}}), 0);
      await assert.rejects(() => service.create(f.driver.id, {...dto, message: 'Different'}), ConflictException);
      const retry = await service.create(f.driver.id, {...dto, location: {latitude: 0, longitude: 0, recordedAt: new Date().toISOString()}});
      assert.equal(retry.latitude, null);
      assert.notEqual((await service.create(f.driver.id, {...dto, clientRequestId: randomUUID()})).id, a.id);
    });
    await check('Driver ownership and authentication protect alert creation and reads', async () => {
      const f = await fixture();
      await assert.rejects(() => service.create(f.other.id, {clientRequestId: randomUUID(), rideId: f.ride.id}), NotFoundException);
      const a = await service.create(f.driver.id, {clientRequestId: randomUUID()});
      await assert.rejects(() => service.getMine(f.other.id, a.id), NotFoundException);
      assert.equal((await service.listMine(f.other.id, {limit: 25})).items.length, 0);
      await db.driver.update({where: {id: f.driver.id}, data: {status: 'SUSPENDED'}});
      await service.create(f.driver.id, {clientRequestId: randomUUID()});
      await db.driver.update({where: {id: f.driver.id}, data: {isAuthActive: false}});
      await assert.rejects(() => service.create(f.driver.id, {clientRequestId: randomUUID()}), UnauthorizedException);
    });
    await check('Missing or invalid GPS never blocks an alert; valid stale coordinates remain labelled', async () => {
      const f = await fixture();
      for (const location of [undefined, null, 'bad', {latitude: 100, longitude: 0, recordedAt: new Date().toISOString()}, {latitude: 0, longitude: 0, recordedAt: '2999-01-01T00:00:00Z'}, {latitude: 0, longitude: 0, recordedAt: 'bad'}]) {
        const a = await service.create(f.driver.id, {clientRequestId: randomUUID(), location, clientOccurredAt: 'bad'});
        assert.equal(a.latitude, null); assert.equal(a.clientOccurredAt, null); assert.equal(a.locationAccepted, false);
      }
      const old = new Date(Date.now() - 600000).toISOString();
      const a = await service.create(f.driver.id, {clientRequestId: randomUUID(), location: {latitude: -9.4, longitude: 147.1, recordedAt: old, accuracyMeters: -1}, clientOccurredAt: '2999-01-01T00:00:00Z'});
      assert.equal(a.latitude, -9.4); assert.equal(a.accuracyMeters, null); assert.equal(a.clientOccurredAt, null);
      assert.equal(a.locationRecordedAt.toISOString(), old); assert.equal(a.locationIsStale, true);
      assert.equal((await service.getAdmin(a.id)).locationIsStale, true);
    });
    await check('Reading an Admin inbox item never acknowledges an emergency', async () => {
      const f = await fixture();
      const a = await service.create(f.driver.id, {clientRequestId: randomUUID()});
      const inbox = await notifications.listAdminInbox(f.admin.id, {limit: 50});
      const item = inbox.items.find(i => i.emergencyAlertId === a.id);
      assert(item); assert.equal(item.emergencyAlert.id, a.id);
      await notifications.markAdminItemRead(f.admin.id, item.id);
      assert.equal((await service.getAdmin(a.id)).status, 'OPEN');
      assert.equal(await db.emergencyAlertEvent.count({where: {alertId: a.id}}), 1);
    });
    await check('Competing Admin acknowledgements have one audited winner and idempotent retries', async () => {
      const f = await fixture();
      const a = await service.create(f.driver.id, {clientRequestId: randomUUID()});
      await assert.rejects(() => service.resolve(f.admin.id, a.id, 'Too early'), ConflictException);
      const results = await race('action', a.id, [() => service.acknowledge(f.admin.id, a.id, 'Contacting'), () => service.acknowledge(f.second.id, a.id, 'Contacting')]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert(results.find(r => r.status === 'rejected').reason instanceof ConflictException);
      const winner = await db.emergencyAlertEvent.findUniqueOrThrow({where: {alertId_action: {alertId: a.id, action: 'ACKNOWLEDGED'}}});
      await service.acknowledge(winner.adminId, a.id, 'Contacting');
      await assert.rejects(() => service.acknowledge(winner.adminId, a.id, 'Changed'), ConflictException);
      assert.equal(await db.emergencyAlertEvent.count({where: {alertId: a.id}}), 2);
      const resolutions = await race('action', a.id, [() => service.resolve(f.admin.id, a.id, 'Safe now'), () => service.resolve(f.second.id, a.id, 'Safe now')]);
      assert.equal(resolutions.filter(r => r.status === 'fulfilled').length, 1);
      assert(resolutions.find(r => r.status === 'rejected').reason instanceof ConflictException);
      const resolved = await db.emergencyAlertEvent.findUniqueOrThrow({where: {alertId_action: {alertId: a.id, action: 'RESOLVED'}}});
      await service.resolve(resolved.adminId, a.id, 'Safe now');
      const mine = await service.getMine(f.driver.id, a.id);
      assert.equal(mine.status, 'RESOLVED'); assert.equal(mine.humanAcknowledged, true);
      for (const privateKey of ['events', 'adminId', 'note', 'driver']) assert(!(privateKey in mine));
      assert.equal(await db.emergencyAlertEvent.count({where: {alertId: a.id}}), 3);
      assert(!(await service.listAdmin({limit: 50, driverId: f.driver.id})).items.some(i => i.id === a.id));
      assert.equal((await service.listAdmin({limit: 50, driverId: f.driver.id, status: 'RESOLVED'})).items.length, 1);
    });
    await check('Audit failure rolls back status and timestamps', async () => {
      const f = await fixture();
      const a = await service.create(f.driver.id, {clientRequestId: randomUUID()});
      await assert.rejects(() => service.acknowledge('missing-admin', a.id, 'Rollback'));
      const after = await service.getAdmin(a.id);
      assert.equal(after.status, 'OPEN'); assert.equal(after.acknowledgedAt, null);
      assert.equal(after.events.length, 1); assert.equal(after.updatedAt.toISOString(), a.updatedAt.toISOString());
      await service.acknowledge(f.admin.id, a.id, 'Valid acknowledgement');
      await assert.rejects(() => service.resolve('missing-admin', a.id, 'Rollback resolution'));
      const stillAcknowledged = await service.getAdmin(a.id);
      assert.equal(stillAcknowledged.status, 'ACKNOWLEDGED'); assert.equal(stillAcknowledged.resolvedAt, null);
      assert.equal(stillAcknowledged.events.length, 2);
    });
    await check('Inbox write failure rolls back the alert and creation event', async () => {
      const f = await fixture();
      // A trigger in the disposable CI database exercises a real database failure.
      await control.query(`CREATE FUNCTION ci_reject_emergency_inbox() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW."emergencyAlertId" IS NOT NULL THEN RAISE EXCEPTION 'CI injected failure'; END IF; RETURN NEW; END $$`);
      try {
        await control.query('CREATE TRIGGER ci_reject_emergency_inbox BEFORE INSERT ON "NotificationInboxItem" FOR EACH ROW EXECUTE FUNCTION ci_reject_emergency_inbox()');
        await assert.rejects(() => service.create(f.driver.id, {clientRequestId: randomUUID()}));
        assert.equal(await db.driverEmergencyAlert.count({where: {driverId: f.driver.id}}), 0);
        assert.equal(await db.emergencyAlertEvent.count({where: {alert: {driverId: f.driver.id}}}), 0);
      } finally {
        await control.query('DROP TRIGGER IF EXISTS ci_reject_emergency_inbox ON "NotificationInboxItem"');
        await control.query('DROP FUNCTION ci_reject_emergency_inbox()');
      }
    });
    await check('Zero active Admins preserves the alert and reports zero inbox recipients', async () => {
      const f = await fixture();
      const active = await db.adminAccount.findMany({where: {isActive: true}, select: {id: true}});
      try {
        await db.adminAccount.updateMany({where: {id: {in: active.map(a => a.id)}}, data: {isActive: false}});
        const a = await service.create(f.driver.id, {clientRequestId: randomUUID()});
        assert.equal(a.adminInboxItemCount, 0); assert.equal(a.serverReceived, true); assert.equal(a.humanAcknowledged, false);
        assert.equal((await service.getAdmin(a.id)).status, 'OPEN');
      } finally {
        await db.adminAccount.updateMany({where: {id: {in: active.map(a => a.id)}}, data: {isActive: true}});
      }
    });
    console.log(`${count} real PostgreSQL emergency service checks passed.`);
  } catch (error) {
    console.error(`FAIL: ${stage}. Values withheld.`);
    if (typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) console.error(`SQLSTATE: ${error.code}`);
    if (error.code === 'ERR_ASSERTION') console.error('Failure category: test assertion');
    const location = typeof error.stack === 'string' ? error.stack.match(/verify-emergency-service\.cjs:(\d+):(\d+)/) : null;
    if (location) console.error(`Emergency test line: ${location[1]}`);
    throw new Error('Emergency service verification failed; see filtered diagnostics');
  } finally {
    const cleanup = await Promise.allSettled([control.end(), db.onModuleDestroy()]);
    if (cleanup.some(r => r.status === 'rejected')) throw new Error('Disposable emergency database cleanup failed; details withheld');
  }
};
