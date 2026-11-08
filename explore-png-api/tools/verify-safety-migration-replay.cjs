// Disposable GitHub-hosted PostgreSQL only. Never use with a Render URL.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const expectedUrl =
  "postgresql://ci:ci@127.0.0.1:54331/joyride_migrations_ci?schema=public";
const expectedMigrations = [
  "20260626095159_init_explore_png",
  "20260626114038_add_png_location_structure",
  "20260628062733_align_driver_rides_service_zones",
  "20260628064334_sync_compound_slug_indexes",
  "20260628114611_remove_old_ride_fields",
  "20260629131537_add_ride_settlements",
  "20260705054347_add_driver_location_history",
  "20260822073902_vehicle_one_active_per_driver",
  "20260822122742_add_driver_vehicle_compliance_fields",
  "20260825030721_add_admin_accounts",
  "20260828015043_add_rider_driver_auth_foundation",
  "20260904093000_add_ride_audit_events",
  "20260906090000_add_notification_inbox",
  "20260930000000_add_feedback_emergency",
  "20261002000000_add_emergency_location_source",
];
let stage = "CI destination guard";
let pool;
let prisma;
function cli(args) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    const codes = [
      ...new Set(
        `${result.stdout || ""}\n${result.stderr || ""}`.match(/\bP\d{4}\b/g) ||
          [],
      ),
    ];
    for (const code of codes) console.log(`Prisma diagnostic code: ${code}`);
    throw new Error("Prisma command failed");
  }
}
async function history() {
  const { rows } = await pool.query(
    'SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
  );
  assert.deepEqual(
    rows.map((row) => row.migration_name),
    expectedMigrations,
  );
  for (const row of rows) {
    assert.ok(row.finished_at && !row.rolled_back_at);
    const bytes = fs.readFileSync(
      path.join("prisma/migrations", row.migration_name, "migration.sql"),
    );
    assert.equal(
      row.checksum,
      crypto.createHash("sha256").update(bytes).digest("hex"),
    );
  }
  return rows.map((row) => ({
    name: row.migration_name,
    checksum: row.checksum,
    finished: row.finished_at.toISOString(),
  }));
}
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted");
  assert.equal(process.env.JOYRIDE_MIGRATION_REPLAY, "disposable-pg18");
  assert.equal(process.env.DATABASE_URL, expectedUrl);
  assert.ok(!fs.existsSync(".env"), "Environment file refused");
  const directories = fs
    .readdirSync("prisma/migrations", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(directories, expectedMigrations);
  assert.deepEqual(
    fs.readFileSync("tools/drafts/feedback-emergency/migration.sql"),
    fs.readFileSync(
      path.join(
        "prisma/migrations",
        "20260930000000_add_feedback_emergency",
        "migration.sql",
      ),
    ),
  );
  console.log(
    "PASS: Disposable CI destination and exact migration scope verified.",
  );
  stage = "empty PostgreSQL 18 database";
  const { Pool } = require("pg");
  pool = new Pool({
    connectionString: expectedUrl,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    max: 2,
  });
  const identity = await pool.query(
    "SELECT current_database() AS name, current_user AS username, current_setting('server_version_num')::int AS version",
  );
  assert.equal(identity.rows[0].name, "joyride_migrations_ci");
  assert.equal(identity.rows[0].username, "ci");
  assert.ok(
    identity.rows[0].version >= 180000 && identity.rows[0].version < 190000,
  );
  const existing = await pool.query(
    "SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f','S')",
  );
  assert.equal(existing.rows[0].count, 0);
  console.log("PASS: Fresh empty PostgreSQL 18 database confirmed.");
  stage = "full migration deployment";
  cli(["migrate", "deploy"]);
  const before = await history();
  console.log(
    "PASS: All 15 registered migrations applied with matching checksums.",
  );
  stage = "repeat migration deployment";
  cli(["migrate", "deploy"]);
  assert.deepEqual(await history(), before);
  console.log("PASS: Repeat deployment leaves migration history unchanged.");
  stage = "feedback and emergency database protections";
  const names = [
    "RideFeedback_ratings_check",
    "DriverEmergencyAlert_request_check",
    "DriverEmergencyAlert_location_check",
    "DriverEmergencyAlert_status_check",
    "DriverEmergencyAlert_source_requires_location_check",
    "DriverEmergencyAlert_manual_accuracy_check",
    "EmergencyAlertEvent_actor_check",
  ];
  const checks = await pool.query(
    "SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY($1::text[])",
    [names],
  );
  assert.deepEqual(
    checks.rows.map((row) => row.conname).sort(),
    [...names].sort(),
  );
  assert.ok(checks.rows.every((row) => row.convalidated));
  const foreignNames = [
    "RideFeedback_rideId_fkey",
    "RideFeedback_riderId_fkey",
    "RideFeedback_driverId_fkey",
    "FeedbackReviewEvent_feedbackId_fkey",
    "FeedbackReviewEvent_adminId_fkey",
    "DriverEmergencyAlert_driverId_fkey",
    "DriverEmergencyAlert_rideId_fkey",
    "EmergencyAlertEvent_alertId_fkey",
    "EmergencyAlertEvent_adminId_fkey",
    "NotificationInboxItem_emergencyAlertId_fkey",
  ];
  const fks = await pool.query(
    "SELECT conname, confdeltype, convalidated FROM pg_constraint WHERE conname = ANY($1::text[])",
    [foreignNames],
  );
  assert.deepEqual(
    fks.rows.map((row) => row.conname).sort(),
    [...foreignNames].sort(),
  );
  assert.ok(
    fks.rows.every((row) => row.confdeltype === "r" && row.convalidated),
  );
  const indexes = [
    "RideFeedback_rideId_key",
    "DriverEmergencyAlert_driverId_clientRequestId_key",
    "EmergencyAlertEvent_alertId_action_key",
  ];
  const unique = await pool.query(
    "SELECT c.relname AS name, i.indisunique, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = ANY($1::text[])",
    [indexes],
  );
  assert.deepEqual(
    unique.rows.map((row) => row.name).sort(),
    [...indexes].sort(),
  );
  assert.ok(unique.rows.every((row) => row.indisunique && row.indisvalid));
  const notification = await pool.query(
    "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'NotificationEventType' AND enumlabel = 'DRIVER_EMERGENCY_ALERT'",
  );
  assert.equal(notification.rowCount, 1);
  console.log(
    "PASS: Validated checks, restrictive references, unique indexes and emergency notification type exist.",
  );
  stage = "generated Prisma client compatibility";
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  for (const model of [
    "rideFeedback",
    "feedbackReviewEvent",
    "driverEmergencyAlert",
    "emergencyAlertEvent",
    "notificationInboxItem",
    "ride",
    "driver",
    "vehicle",
    "riderAccount",
    "adminAccount",
  ]) {
    assert.deepEqual(await prisma[model].findMany({ take: 1 }), []);
  }
  console.log(
    "PASS: Generated Prisma client reads all ten integration models from the migrated database.",
  );
  console.log(
    "PASS: Migration replay completed on disposable CI only. Production was not contacted.",
  );
}
(async () => {
  try {
    await main();
  } catch (error) {
    console.error(`STOP: ${stage}. Raw details withheld.`);
    if (
      error &&
      typeof error.code === "string" &&
      /^(?:[0-9A-Z]{5}|P\d{4}|ERR_ASSERTION)$/.test(error.code)
    )
      console.error(`Diagnostic code: ${error.code}`);
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
    if (pool) await pool.end().catch(() => {});
  }
})();
