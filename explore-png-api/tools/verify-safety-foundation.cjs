/* Run only against the disposable database in safety-foundation-ci.yml. */
const expectedUrl = 'postgresql://ci@127.0.0.1:54330/joyride_safety_ci?schema=public';
if (process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    process.env.JOYRIDE_SAFETY_DB_TEST !== '1' ||
    process.env.DATABASE_URL !== expectedUrl) {
  console.error('REFUSED: requires the dedicated GitHub-hosted safety database job.');
  process.exit(1);
}

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const root = path.resolve(__dirname, '..');
let stage = 'initialize disposable baseline';
let db;
let checks = 0;
const id = () => randomUUID();

async function main() {
  // No .env is read by this runner. The exact disposable URL is already required.
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'),
    'db', 'push', '--schema', 'tools/fixtures/feedback-emergency-baseline.prisma'],
  { cwd: root, env: process.env, stdio: 'pipe', timeout: 120000 });
  db = new Client({ connectionString: expectedUrl, statement_timeout: 15000 });
  await db.connect();
  const version = await db.query('SHOW server_version_num');
  assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 18);
  const identity = await db.query('SELECT current_database() AS db');
  assert.equal(identity.rows[0].db, 'joyride_safety_ci');

  const driver = id(), rider = id(), admin = id(), ride = id(), vehicle = id();
  const secondDriver = id();
  await db.query(`INSERT INTO "Driver" (id,"fullName",phone,status,"updatedAt")
    VALUES ($1,'CI driver',$1,'APPROVED',now()),($2,'CI second driver',$2,'APPROVED',now())`, [driver, secondDriver]);
  await db.query(`INSERT INTO "RiderAccount" (id,"fullName",phone,"passwordHash","updatedAt")
    VALUES ($1,'CI rider',$1,'test-only',now())`, [rider]);
  await db.query(`INSERT INTO "AdminAccount" (id,email,"fullName","passwordHash","updatedAt")
    VALUES ($1,$1,'CI admin','test-only',now())`, [admin]);
  await db.query(`INSERT INTO "Vehicle" (id,"plateNumber","driverId",status,"updatedAt")
    VALUES ($1,$1,$2,'ACTIVE',now())`, [vehicle, driver]);
  await db.query(`INSERT INTO "Ride" (id,"riderId","driverId","vehicleId",status,"finalFare","updatedAt")
    VALUES ($1,$2,$3,$4,'COMPLETED',25,now())`, [ride, rider, driver, vehicle]);
  await db.query(`INSERT INTO "RideSettlement" (id,"rideId","receiptNumber","driverId","vehicleId",
    "finalFare","driverShare","companyShare","updatedAt")
    VALUES ($1,$2,$1,$3,$4,25,20,5,now())`, [id(), ride, driver, vehicle]);

  const legacyTables = ['Driver','RiderAccount','AdminAccount','Vehicle','Ride','RideSettlement'];
  async function snapshot() {
    const result = {};
    for (const table of legacyTables) {
      // Table names are fixed constants; no client input enters this identifier.
      result[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY id`)).rows;
    }
    return result;
  }
  const before = await snapshot();
  stage = 'apply actual SQL draft';
  await db.query(fs.readFileSync(path.join(root, 'tools/drafts/feedback-emergency/migration.sql'), 'utf8'));
  assert.deepEqual(await snapshot(), before);
  checks++;
  console.log('PASS: Actual SQL draft applied; existing fixture data unchanged.');

  async function check(name, fn) {
    stage = name;
    await db.query('BEGIN');
    try {
      await fn();
      checks++;
      console.log(`PASS: ${name}`);
    } finally { await db.query('ROLLBACK'); }
  }
  async function rejected(code, fn) {
    await db.query('SAVEPOINT expected_rejection');
    let error;
    try { await fn(); } catch (caught) { error = caught; }
    await db.query('ROLLBACK TO SAVEPOINT expected_rejection');
    await db.query('RELEASE SAVEPOINT expected_rejection');
    assert(error, 'EXPECTED_DATABASE_REJECTION');
    assert.equal(error.code, code, 'EXPECTED_SQLSTATE');
  }
  async function feedback(rating = 5, care = null, feedbackId = id()) {
    await db.query(`INSERT INTO "RideFeedback" (id,"rideId","riderId","driverId",
      "overallRating","customerCareRating","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())`,
    [feedbackId, ride, rider, driver, rating, care]);
    return feedbackId;
  }
  async function alert(request = id(), owner = driver, alertId = id()) {
    await db.query(`INSERT INTO "DriverEmergencyAlert" (id,"clientRequestId","driverId","updatedAt")
      VALUES ($1,$2,$3,now())`, [alertId, request, owner]);
    return alertId;
  }
  async function action(alertId, kind, adminId = null) {
    await db.query(`INSERT INTO "EmergencyAlertEvent" (id,"alertId",action,"adminId")
      VALUES ($1,$2,$3,$4)`, [id(), alertId, kind, adminId]);
  }

  await check('Feedback accepts boundary scores and absent optional ratings', async () => {
    const f = await feedback(1);
    await db.query(`UPDATE "RideFeedback" SET "overallRating"=5,"customerCareRating"=1,
      "professionalismRating"=5,"drivingRating"=1,"cleanlinessRating"=5 WHERE id=$1`, [f]);
    assert.equal((await db.query('SELECT "reviewStatus" FROM "RideFeedback" WHERE id=$1',[f])).rows[0].reviewStatus, 'NEW');
  });
  await check('All feedback scores reject values outside 1 through 5', async () => {
    const f = await feedback();
    const fields = ['overallRating','customerCareRating','professionalismRating','drivingRating','cleanlinessRating'];
    for (const field of fields) for (const value of [0, 6, -1]) {
      await rejected('23514', () => db.query(`UPDATE "RideFeedback" SET "${field}"=$1 WHERE id=$2`, [value, f]));
    }
  });
  await check('One feedback per ride and bounded comment enforced', async () => {
    const f = await feedback();
    await rejected('23505', () => feedback());
    await rejected('22001', () => db.query('UPDATE "RideFeedback" SET comment=$1 WHERE id=$2',['x'.repeat(1001),f]));
  });
  await check('Feedback rejects missing parents and retains audit references', async () => {
    const f = await feedback();
    await rejected('23503', () => db.query('UPDATE "RideFeedback" SET "riderId"=$1 WHERE id=$2',[id(),f]));
    await db.query(`INSERT INTO "FeedbackReviewEvent" (id,"feedbackId","adminId","previousStatus","newStatus")
      VALUES ($1,$2,$3,'NEW','REVIEWED')`,[id(),f,admin]);
    await rejected('23001', () => db.query('DELETE FROM "RideFeedback" WHERE id=$1',[f]));
  });
  await check('Emergency accepts no GPS and no active ride', async () => {
    const a = await alert();
    const row = (await db.query('SELECT status,"rideId",latitude,"createdAt" FROM "DriverEmergencyAlert" WHERE id=$1',[a])).rows[0];
    assert.equal(row.status, 'OPEN'); assert.equal(row.rideId, null); assert.equal(row.latitude, null);
    assert(row.createdAt instanceof Date);
  });
  await check('Emergency request deduplication is scoped to driver', async () => {
    const request = id(); await alert(request);
    await rejected('23505', () => alert(request));
    await alert(request, secondDriver);
    await rejected('23514', () => alert('   '));
  });
  await check('Location requires paired finite coordinates and capture time', async () => {
    const a = await alert();
    await rejected('23514', () => db.query('UPDATE "DriverEmergencyAlert" SET latitude=0 WHERE id=$1',[a]));
    await rejected('23514', () => db.query('UPDATE "DriverEmergencyAlert" SET latitude=0,longitude=0 WHERE id=$1',[a]));
    await db.query('UPDATE "DriverEmergencyAlert" SET latitude=0,longitude=0,"locationRecordedAt"=now() WHERE id=$1',[a]);
    for (const latitude of [91, -91, 'NaN', 'Infinity']) {
      await rejected('23514', () => db.query('UPDATE "DriverEmergencyAlert" SET latitude=$1 WHERE id=$2',[latitude,a]));
    }
    for (const longitude of [181,-181,'NaN','Infinity']) {
      await rejected('23514', () => db.query('UPDATE "DriverEmergencyAlert" SET longitude=$1 WHERE id=$2',[longitude,a]));
    }
    for (const accuracy of [-1,'NaN','Infinity']) {
      await rejected('23514', () => db.query('UPDATE "DriverEmergencyAlert" SET "accuracyMeters"=$1 WHERE id=$2',[accuracy,a]));
    }
    await db.query('UPDATE "DriverEmergencyAlert" SET "accuracyMeters"=0 WHERE id=$1',[a]);
  });
  await check('Alert status requires consistent acknowledgement and resolution timestamps', async () => {
    const a = await alert();
    await rejected('23514', () => db.query(`UPDATE "DriverEmergencyAlert" SET status='ACKNOWLEDGED' WHERE id=$1`,[a]));
    await rejected('23514', () => db.query(`UPDATE "DriverEmergencyAlert" SET status='RESOLVED',"resolvedAt"=now() WHERE id=$1`,[a]));
    await db.query(`UPDATE "DriverEmergencyAlert" SET status='ACKNOWLEDGED',"acknowledgedAt"=now() WHERE id=$1`,[a]);
    await rejected('23514', () => db.query(`UPDATE "DriverEmergencyAlert" SET status='RESOLVED',"resolvedAt"="acknowledgedAt"-interval '1 second' WHERE id=$1`,[a]));
    await db.query(`UPDATE "DriverEmergencyAlert" SET status='RESOLVED',"resolvedAt"=now() WHERE id=$1`,[a]);
  });
  await check('Audit actions require proper actor and cannot duplicate acknowledgement', async () => {
    const a = await alert();
    await rejected('23514', () => action(a, 'CREATED', admin));
    await action(a, 'CREATED');
    await rejected('23514', () => action(a, 'ACKNOWLEDGED'));
    await rejected('23503', () => action(a, 'ACKNOWLEDGED', id()));
    await action(a, 'ACKNOWLEDGED', admin);
    await rejected('23505', () => action(a, 'ACKNOWLEDGED', admin));
    await rejected('23514', () => action(a, 'RESOLVED'));
    await action(a, 'RESOLVED', admin);
    await rejected('23001', () => db.query('DELETE FROM "DriverEmergencyAlert" WHERE id=$1',[a]));
  });
  await check('Alert foreign keys and message length enforced', async () => {
    await rejected('23503', () => alert(id(), id()));
    const a = await alert();
    await rejected('23503', () => db.query('UPDATE "DriverEmergencyAlert" SET "rideId"=$1 WHERE id=$2',[id(),a]));
    await rejected('22001', () => db.query('UPDATE "DriverEmergencyAlert" SET message=$1 WHERE id=$2',['x'.repeat(501),a]));
  });
  assert.deepEqual(await snapshot(), before);
  console.log(`${checks} PostgreSQL foundation checks passed. No production database used.`);
  stage = 'feedback service verification';
  await require('./verify-feedback-service.cjs')();
  stage = 'emergency service verification';
  await require('./verify-emergency-service.cjs')();
  console.log('Phone integration, push delivery and operational response tests are still required.');
}
main().catch((error) => {
  console.error(`FAIL: ${stage}. Database details withheld.`);
  const sqlState = (value) => typeof value === 'string' && /^[0-9A-Z]{5}$/.test(value);
  if (sqlState(error?.code)) console.error(`SQLSTATE: ${error.code}`);
  if (error?.code === 'ERR_ASSERTION') {
    console.error('Failure category: test assertion');
    if (sqlState(error.expected)) console.error(`Expected SQLSTATE: ${error.expected}`);
    if (sqlState(error.actual)) console.error(`Actual SQLSTATE: ${error.actual}`);
  }
  const knownConstraints = new Set([
    'RideFeedback_riderId_fkey', 'RideFeedback_rideId_fkey', 'RideFeedback_driverId_fkey',
    'FeedbackReviewEvent_feedbackId_fkey', 'FeedbackReviewEvent_adminId_fkey',
    'FeedbackReviewEvent_pkey', 'RideFeedback_pkey', 'RideFeedback_rideId_key',
  ]);
  if (knownConstraints.has(error?.constraint)) console.error(`Constraint: ${error.constraint}`);
  const location = typeof error?.stack === 'string'
    ? error.stack.match(/verify-safety-foundation\.cjs:(\d+):(\d+)/) : null;
  if (location) console.error(`Test runner line: ${location[1]}`);
  process.exitCode = 1;
}).finally(async () => {
  if (db) try { await db.end(); } catch {
    console.error('FAIL: disposable database cleanup. Details withheld.');
    process.exitCode = 1;
  }
});
