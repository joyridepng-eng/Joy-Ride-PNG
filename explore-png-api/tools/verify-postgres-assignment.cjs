/* Real service/database checks. Intentionally restricted to disposable GitHub CI. */
const expectedUrl = 'postgresql://ci@127.0.0.1:54329/joyride_assignment_ci?schema=public';
if (process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.JOYRIDE_POSTGRES_TEST !== '1' ||
    process.env.DATABASE_URL !== expectedUrl) {
  console.error('REFUSED: requires the dedicated GitHub-hosted PostgreSQL test job.');
  process.exit(1);
}

const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const root = path.resolve(__dirname, '..');
let stage = 'initialize disposable schema';
let db;
let control;

async function main() {
  // This command is behind the CI/host/database guard above; never uses local .env.
  execFileSync(process.execPath, [
    require.resolve('prisma/build/index.js'), 'db', 'push',
  ], { cwd: root, env: process.env, stdio: 'pipe', timeout: 120000 });
  require('reflect-metadata');
  const { Client } = require('pg');
  const { PrismaService } = require('../dist/src/prisma/prisma.service');
  const { RidesService } = require('../dist/src/rides/rides.service');
  const { DriversService } = require('../dist/src/drivers/drivers.service');
  const { NotificationsService } = require('../dist/src/notifications/notifications.service');
  const { BadRequestException } = require('@nestjs/common');
  db = new PrismaService();
  await db.onModuleInit();
  control = new Client({ connectionString: expectedUrl });
  await control.connect();
  const notices = new NotificationsService(db);
  // Assignment and status updates do not call routing. Fail if that changes.
  const routing = { getDrivingRoute() { throw new Error('UNEXPECTED_ROUTING_CALL'); } };
  const rides = new RidesService(db, routing, notices);
  const drivers = new DriversService(db);
  const active = ['ACCEPTED', 'DRIVER_ARRIVED', 'IN_PROGRESS'];

  async function fixture() {
    const tag = randomUUID();
    const driver = await db.driver.create({ data: {
      fullName: 'CI Driver', phone: `ci-${tag}`, status: 'APPROVED',
      isOnline: true, isAvailable: true,
      vehicles: { create: { plateNumber: `ci-${tag}`, status: 'ACTIVE' } },
    }, include: { vehicles: true } });
    const a = await db.ride.create({ data: { estimatedFare: 25 } });
    const b = await db.ride.create({ data: { estimatedFare: 25 } });
    return { driver, a, b };
  }
  async function markActive(f, status) {
    await db.ride.update({ where: { id: f.a.id }, data: {
      driverId: f.driver.id, vehicleId: f.driver.vehicles[0].id, status,
    } });
  }
  async function busy(id) {
    const d = await db.driver.findUniqueOrThrow({ where: { id } });
    assert.equal(d.isAvailable, false, 'DRIVER_MUST_REMAIN_BUSY');
  }
  function singleWinner(out) {
    assert.equal(out.filter(x => x.status === 'fulfilled').length, 1, 'ONE_WINNER_REQUIRED');
    const loser = out.find(x => x.status === 'rejected');
    assert(loser && loser.reason instanceof BadRequestException, 'EXPECTED_BUSINESS_REJECTION');
  }
  // Hold a real DB lock, start both service calls, and prove both are waiting
  // before release. Merely calling Promise.all is not evidence of contention.
  async function race(lockSql, lockArgs, lockType, calls) {
    await control.query('BEGIN');
    let pending;
    try {
      await control.query(lockSql, lockArgs);
      pending = Promise.allSettled(calls.map(fn => Promise.resolve().then(fn)));
      const deadline = Date.now() + 6000;
      let waiters = 0;
      do {
        // Refresh activity data while the separate service calls acquire their locks.
        await control.query('SELECT pg_stat_clear_snapshot()');
        const result = await control.query(
          `SELECT count(*)::int AS n FROM pg_locks
           WHERE NOT granted AND ($1::text IS NULL OR locktype = $1)
           AND pid IN (SELECT pid FROM pg_stat_activity WHERE datname = current_database())`,
          [lockType],
        );
        waiters = result.rows[0].n;
        if (waiters >= calls.length) break;
        await delay(25);
      } while (Date.now() < deadline);
      assert(waiters >= calls.length, 'CONCURRENT_LOCK_WAIT_NOT_OBSERVED');
      await control.query('COMMIT');
      return await pending;
    } finally {
      await control.query('ROLLBACK');
      if (pending) await pending;
    }
  }
  const driverRace = (id, calls) => race(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`joyride:driver-assignment:${id}`], 'advisory', calls,
  );
  async function check(name, fn) {
    stage = name;
    await fn();
    console.log(`PASS: ${name}`);
  }

  await check('Two assignments to one driver contend; exactly one commits', async () => {
    const f = await fixture();
    const out = await driverRace(f.driver.id, [
      () => rides.assignDriver(f.a.id, { driverId: f.driver.id }),
      () => rides.assignDriver(f.b.id, { driverId: f.driver.id }),
    ]);
    singleWinner(out);
    assert.equal(await db.ride.count({ where: { driverId: f.driver.id, status: { in: active } } }), 1);
    assert.equal(await db.notificationInboxItem.count({ where: { driverId: f.driver.id } }), 1);
    assert.equal(await db.rideAuditEvent.count({ where: { driverId: f.driver.id, eventType: 'DRIVER_ASSIGNED' } }), 1);
    await busy(f.driver.id);
  });

  await check('Go Online racing with assignment cannot reopen the driver', async () => {
    const f = await fixture();
    const out = await driverRace(f.driver.id, [
      () => rides.assignDriver(f.a.id, { driverId: f.driver.id }),
      () => drivers.updateAvailability(f.driver.id, { isOnline: true, isAvailable: true }),
    ]);
    assert(out.every(x => x.status === 'fulfilled'), 'BOTH_OPERATIONS_MUST_SUCCEED');
    await busy(f.driver.id);
  });

  for (const status of active) {
    await check(`Stale availability and Go Online cannot bypass ${status}`, async () => {
      const f = await fixture();
      await markActive(f, status); // Deliberately leave isAvailable=true.
      await assert.rejects(() => rides.assignDriver(f.b.id, { driverId: f.driver.id }), BadRequestException);
      await drivers.updateAvailability(f.driver.id, { isOnline: true, isAvailable: true });
      await busy(f.driver.id);
      assert.equal(await db.notificationInboxItem.count({ where: { driverId: f.driver.id } }), 0);
    });
  }

  await check('Concurrent completion creates one receipt; next assignment stays busy', async () => {
    const f = await fixture();
    await markActive(f, 'IN_PROGRESS');
    await db.driver.update({ where: { id: f.driver.id }, data: { isAvailable: false } });
    const complete = () => rides.updateStatus(f.a.id, { status: 'COMPLETED' }, f.driver.id);
    singleWinner(await driverRace(f.driver.id, [complete, complete]));
    assert.equal(await db.rideSettlement.count({ where: { rideId: f.a.id } }), 1);
    assert.equal(await db.rideAuditEvent.count({ where: { rideId: f.a.id, eventType: 'SETTLEMENT_CREATED' } }), 1);
    assert.equal((await db.driver.findUniqueOrThrow({ where: { id: f.driver.id } })).isAvailable, true);
    await rides.assignDriver(f.b.id, { driverId: f.driver.id });
    await assert.rejects(complete, BadRequestException);
    await busy(f.driver.id);
    assert.equal(await db.rideSettlement.count({ where: { rideId: f.a.id } }), 1);
  });

  await check('Competing drivers claim one ride; losing driver claim rolls back', async () => {
    const f = await fixture();
    const g = await fixture();
    const out = await race('SELECT id FROM "Ride" WHERE id = $1 FOR UPDATE',
      [f.a.id], null, [
        () => rides.assignDriver(f.a.id, { driverId: f.driver.id }),
        () => rides.assignDriver(f.a.id, { driverId: g.driver.id }),
      ]);
    singleWinner(out);
    const assigned = await db.ride.findUniqueOrThrow({ where: { id: f.a.id } });
    const loserId = assigned.driverId === f.driver.id ? g.driver.id : f.driver.id;
    assert.equal((await db.driver.findUniqueOrThrow({ where: { id: loserId } })).isAvailable, true);
    await busy(assigned.driverId);
    assert.equal(await db.notificationInboxItem.count({ where: { rideId: f.a.id } }), 1);
    assert.equal(await db.rideAuditEvent.count({ where: { rideId: f.a.id, eventType: 'DRIVER_ASSIGNED' } }), 1);
  });
  console.log('7 real PostgreSQL service checks passed. No production database used.');
}

main().catch(() => {
  console.error(`FAIL: ${stage}. Database details withheld.`);
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (control) await control.end();
    if (db) await db.onModuleDestroy();
  } catch {
    console.error('FAIL: test database connection cleanup. Details withheld.');
    process.exitCode = 1;
  }
});
