const expectedUrl = 'postgresql://ci@127.0.0.1:54330/joyride_safety_ci?schema=public';
if (process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.JOYRIDE_SAFETY_DB_TEST !== '1' ||
    process.env.DATABASE_URL !== expectedUrl) {
  console.error('REFUSED: feedback service tests require the dedicated safety database job.');
  process.exit(1);
}
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
require('reflect-metadata');
const { PrismaService } = require('../dist/src/prisma/prisma.service');
const { FeedbackService } = require('../dist/src/feedback/feedback.service');
const { BadRequestException, ConflictException, NotFoundException } = require('@nestjs/common');
const { Client } = require('pg');

module.exports = async function verifyFeedbackService() {
  const db = new PrismaService();
  const control = new Client({ connectionString: expectedUrl });
  const service = new FeedbackService(db);
  let stage = 'connect disposable feedback test database';
  let count = 0;
  async function check(name, fn) {
    stage = name;
    await fn();
    count++;
    console.log(`PASS: ${name}`);
  }
  async function fixture(status = 'COMPLETED') {
    const tag = randomUUID();
    const rider = await db.riderAccount.create({data: {fullName: 'CI rider', phone: tag, passwordHash: 'test-only'}});
    const other = await db.riderAccount.create({data: {fullName: 'Other rider', phone: randomUUID(), passwordHash: 'test-only'}});
    const driver = await db.driver.create({data: {fullName: 'CI driver', phone: tag, status: 'APPROVED'}});
    const ride = await db.ride.create({data: {riderId: rider.id, driverId: driver.id, status}});
    const admin = await db.adminAccount.create({data: {fullName: 'CI Admin', email: tag, passwordHash: 'test-only'}});
    return {rider, other, driver, ride, admin};
  }
  // Verify actual lock contention instead of assuming Promise.all produces a race.
  async function race(table, recordId, calls) {
    assert(['Ride', 'RideFeedback'].includes(table));
    await control.query('BEGIN');
    let pending;
    try {
      await control.query(`SELECT id FROM "${table}" WHERE id=$1 FOR UPDATE`, [recordId]);
      pending = Promise.allSettled(calls.map(fn => Promise.resolve().then(fn)));
      const deadline = Date.now() + 6000;
      let waiters = 0;
      do {
        // Refresh activity data while the separate service calls acquire their locks.
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
  function oneConflict(results) {
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failed = results.find(r => r.status === 'rejected');
    assert(failed && failed.reason instanceof ConflictException);
  }
  try {
    await db.onModuleInit();
    await control.connect();
    await check('Rider cannot submit or read another rider feedback', async () => {
      const f = await fixture();
      await assert.rejects(() => service.submit(f.other.id, f.ride.id, {overallRating: 5}), NotFoundException);
      await assert.rejects(() => service.getMine(f.other.id, f.ride.id), NotFoundException);
      assert.equal(await db.rideFeedback.count({where: {rideId: f.ride.id}}), 0);
    });
    await check('Feedback rejects unfinished rides and completed rides without a driver', async () => {
      for (const status of ['REQUESTED','ACCEPTED','DRIVER_ARRIVED','IN_PROGRESS','CANCELLED','NO_DRIVER_AVAILABLE']) {
        const f = await fixture(status);
        await assert.rejects(() => service.submit(f.rider.id, f.ride.id, {overallRating: 5}), BadRequestException);
      }
      const f = await fixture();
      await db.ride.update({where: {id: f.ride.id}, data: {driverId: null}});
      await assert.rejects(() => service.submit(f.rider.id, f.ride.id, {overallRating: 5}), BadRequestException);
    });
    await check('Concurrent identical submissions return one immutable record', async () => {
      const f = await fixture();
      const dto = {overallRating: 5, customerCareRating: 4, comment: ' Courteous '};
      const results = await race('Ride', f.ride.id, [
        () => service.submit(f.rider.id, f.ride.id, dto),
        () => service.submit(f.rider.id, f.ride.id, dto),
      ]);
      assert(results.every(r => r.status === 'fulfilled'));
      assert.equal(results[0].value.id, results[1].value.id);
      assert.equal(results[0].value.comment, 'Courteous');
      assert.equal(await db.rideFeedback.count({where: {rideId: f.ride.id}}), 1);
      await assert.rejects(() => service.submit(f.rider.id, f.ride.id, {...dto, overallRating: 1}), ConflictException);
    });
    await check('Conflicting simultaneous submissions preserve one winner', async () => {
      const f = await fixture();
      oneConflict(await race('Ride', f.ride.id, [
        () => service.submit(f.rider.id, f.ride.id, {overallRating: 1}),
        () => service.submit(f.rider.id, f.ride.id, {overallRating: 5}),
      ]));
      assert.equal(await db.rideFeedback.count({where: {rideId: f.ride.id}}), 1);
    });
    await check('Concurrent Admin reviews preserve one action and reject stale retries', async () => {
      const f = await fixture();
      const created = await service.submit(f.rider.id, f.ride.id, {overallRating: 4});
      const current = await service.getForAdmin(created.id);
      const dto = {expectedStatus: 'NEW', expectedUpdatedAt: current.updatedAt.toISOString(), status: 'REVIEWED', note: 'Private follow-up'};
      oneConflict(await race('RideFeedback', created.id, [
        () => service.review(f.admin.id, created.id, dto),
        () => service.review(f.admin.id, created.id, dto),
      ]));
      const events = await db.feedbackReviewEvent.findMany({where: {feedbackId: created.id}});
      assert.equal(events.length, 1); assert.equal(events[0].adminId, f.admin.id);
      await assert.rejects(() => service.review(f.admin.id, created.id, dto), ConflictException);
      const mine = await service.getMine(f.rider.id, f.ride.id);
      assert(!('reviewEvents' in mine)); assert(!('reviewStatus' in mine)); assert(!('adminId' in mine));
    });
    await check('Failed audit write rolls back review and version changes', async () => {
      const f = await fixture();
      const created = await service.submit(f.rider.id, f.ride.id, {overallRating: 4});
      const before = await service.getForAdmin(created.id);
      await assert.rejects(() => service.review('missing-admin', created.id, {
        expectedStatus: 'NEW', expectedUpdatedAt: before.updatedAt.toISOString(), status: 'REVIEWED', note: 'Rollback test',
      }));
      const after = await service.getForAdmin(created.id);
      assert.equal(after.reviewStatus, 'NEW'); assert.equal(after.updatedAt.toISOString(), before.updatedAt.toISOString());
      assert.equal(after.reviewEvents.length, 0);
    });
    await check('Status cycling cannot revive a stale Admin review token', async () => {
      const f = await fixture();
      const created = await service.submit(f.rider.id, f.ride.id, {overallRating: 3});
      let current = await service.getForAdmin(created.id);
      current = await service.review(f.admin.id, created.id, {expectedStatus: current.reviewStatus, expectedUpdatedAt: current.updatedAt.toISOString(), status: 'REVIEWED', note: 'First'});
      const stale = {expectedStatus: current.reviewStatus, expectedUpdatedAt: current.updatedAt.toISOString(), status: 'CLOSED', note: 'Stale'};
      current = await service.review(f.admin.id, created.id, {...stale, status: 'FOLLOW_UP', note: 'Investigate'});
      current = await service.review(f.admin.id, created.id, {expectedStatus: current.reviewStatus, expectedUpdatedAt: current.updatedAt.toISOString(), status: 'REVIEWED', note: 'Checked again'});
      await assert.rejects(() => service.review(f.admin.id, created.id, stale), ConflictException);
    });
    await check('Driver summary contains only scoped aggregate ratings and counts', async () => {
      const f = await fixture();
      const empty = await service.driverSummary(f.driver.id);
      assert.equal(empty.ratingCount, 0); assert.equal(empty.overall.average, null);
      await service.submit(f.rider.id, f.ride.id, {overallRating: 5, customerCareRating: 3, comment: 'PRIVATE_RIDER_COMMENT'});
      const next = await db.ride.create({data: {riderId: f.rider.id, driverId: f.driver.id, status: 'COMPLETED'}});
      await service.submit(f.rider.id, next.id, {overallRating: 3});
      const other = await fixture();
      await service.submit(other.rider.id, other.ride.id, {overallRating: 1});
      assert.deepEqual(await service.driverSummary(f.driver.id), {
        ratingCount: 2, overall: {average: 4, count: 2}, customerCare: {average: 3, count: 1},
        professionalism: {average: null, count: 0}, driving: {average: null, count: 0}, cleanliness: {average: null, count: 0},
      });
      const first = await service.listForAdmin({limit: 1, driverId: f.driver.id});
      assert.equal(first.items.length, 1); assert(first.nextCursor);
      const second = await service.listForAdmin({limit: 1, driverId: f.driver.id, cursor: first.nextCursor});
      assert.equal(second.items.length, 1); assert.notEqual(first.items[0].id, second.items[0].id);
      assert.equal(second.nextCursor, null);
    });
    console.log(`${count} real PostgreSQL feedback service checks passed.`);
  } catch (error) {
    console.error(`FAIL: ${stage}. Values withheld.`);
    if (typeof error.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) console.error(`SQLSTATE: ${error.code}`);
    if (error.code === 'ERR_ASSERTION') console.error('Failure category: test assertion');
    const location = typeof error.stack === 'string' ? error.stack.match(/verify-feedback-service\.cjs:(\d+):(\d+)/) : null;
    if (location) console.error(`Feedback test line: ${location[1]}`);
    throw new Error('Feedback service verification failed; see filtered diagnostics');
  } finally {
    const cleanup = await Promise.allSettled([control.end(), db.onModuleDestroy()]);
    if (cleanup.some(result => result.status === 'rejected')) {
      throw new Error('Disposable feedback database cleanup failed; details withheld');
    }
  }
};
