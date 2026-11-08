/* Real service/database checks. Intentionally restricted to disposable GitHub CI. */
const expectedUrl =
  'postgresql://ci@127.0.0.1:54329/joyride_assignment_ci?schema=public';
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
  process.env.JOYRIDE_POSTGRES_TEST !== '1' ||
  process.env.DATABASE_URL !== expectedUrl
) {
  console.error(
    'REFUSED: requires the dedicated GitHub-hosted PostgreSQL test job.',
  );
  process.exit(1);
}

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

let db;
let stage = 'Opening guarded CI database';
let passed = 0;

function check(name, condition) {
  assert.ok(condition);
  passed++;
  console.log('PASS: ' + name);
}

async function main() {
  require('reflect-metadata');
  const { PrismaService } = require('../dist/src/prisma/prisma.service');
  const {
    DriverLocationReplayService,
  } = require('../dist/src/driver-locations/driver-location-replay.service');

  db = new PrismaService();
  await db.onModuleInit();
  const service = new DriverLocationReplayService(db);

  stage = 'Creating synthetic telemetry fixtures';
  const driver = await db.driver.create({
    data: {
      fullName: 'Synthetic CI telemetry driver',
      phone: 'ci-telemetry-' + randomUUID(),
      status: 'APPROVED',
    },
  });
  const other = await db.driver.create({
    data: {
      fullName: 'Synthetic CI other driver',
      phone: 'ci-telemetry-' + randomUUID(),
      status: 'APPROVED',
    },
  });
  const ride = await db.ride.create({
    data: { driverId: driver.id, status: 'COMPLETED' },
  });
  const foreignRide = await db.ride.create({
    data: { driverId: other.id, status: 'COMPLETED' },
  });
  await db.driverLocation.create({
    data: {
      driverId: driver.id,
      latitude: -9.4,
      longitude: 147.1,
      recordedAt: new Date(),
    },
  });

  const liveBefore = JSON.stringify(
    await db.driverLocation.findUnique({
      where: { driverId: driver.id },
    }),
  );
  const rideBefore = JSON.stringify(
    await db.ride.findUnique({ where: { id: ride.id } }),
  );
  const settlementsBefore = await db.rideSettlement.count();
  const historyCount = () =>
    db.driverLocationHistory.count({
      where: { driverId: driver.id },
    });

  const point = {
    id: 'synthetic_point_' + randomUUID(),
    rideId: ride.id,
    latitude: -9.44,
    longitude: 147.18,
    recordedAt: new Date(Date.now() - 3600000).toISOString(),
  };

  stage = 'Sequential duplicate delivery';
  const first = await service.replay({ points: [point] }, driver.id);
  const second = await service.replay({ points: [point] }, driver.id);
  check(
    'Repeated delivery acknowledges the original identifier',
    first.acceptedIds[0] === point.id && second.acceptedIds[0] === point.id,
  );
  check(
    'Repeated delivery stores one history row',
    (await historyCount()) === 1,
  );

  stage = 'Simultaneous duplicate delivery';
  let retries = 0;
  async function replayWithRetry(body) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await service.replay(body, driver.id);
      } catch (error) {
        if (error?.code !== 'P2034' || attempt === 4) throw error;
        retries++;
        await delay(25 * (attempt + 1));
      }
    }
    throw new Error('Retry limit exceeded');
  }

  const concurrent = {
    ...point,
    id: 'synthetic_point_' + randomUUID(),
  };
  const results = await Promise.all(
    Array.from({ length: 4 }, () => replayWithRetry({ points: [concurrent] })),
  );
  check(
    'Simultaneous retries acknowledge the same identifier',
    results.every((result) => result.acceptedIds[0] === concurrent.id),
  );
  check(
    'Simultaneous retries store only one additional row',
    (await historyCount()) === 2,
  );
  console.log('Serialization retries handled by test harness:', retries);

  stage = 'Conflicting batch rollback';
  let conflict = false;
  try {
    await service.replay(
      {
        points: [
          { ...point, id: 'synthetic_point_' + randomUUID() },
          { ...point, longitude: 148 },
        ],
      },
      driver.id,
    );
  } catch (error) {
    conflict =
      typeof error?.getStatus === 'function' && error.getStatus() === 409;
  }
  check('Changed payload under an existing identifier is rejected', conflict);
  check(
    'Conflict rolls back all new rows from that batch',
    (await historyCount()) === 2,
  );

  stage = 'Foreign ride ownership';
  let forbidden = false;
  try {
    await service.replay(
      {
        points: [
          {
            ...point,
            id: 'synthetic_point_' + randomUUID(),
            rideId: foreignRide.id,
          },
        ],
      },
      driver.id,
    );
  } catch (error) {
    forbidden =
      typeof error?.getStatus === 'function' && error.getStatus() === 403;
  }
  check(
    'Foreign ride is rejected without history writes',
    forbidden && (await historyCount()) === 2,
  );

  stage = 'Preservation checks';
  check(
    'Live location remains unchanged',
    liveBefore ===
      JSON.stringify(
        await db.driverLocation.findUnique({
          where: { driverId: driver.id },
        }),
      ),
  );
  check(
    'Completed ride remains unchanged',
    rideBefore ===
      JSON.stringify(await db.ride.findUnique({ where: { id: ride.id } })),
  );
  check(
    'Replay creates no settlements',
    settlementsBefore === (await db.rideSettlement.count()),
  );

  console.log('Passed PostgreSQL telemetry checks:', passed);
}

main()
  .catch(() => {
    console.error('STOP: PostgreSQL telemetry stage: ' + stage);
    console.error('Raw database errors and record values withheld.');
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (db) await db.onModuleDestroy();
    } catch {
      console.error('STOP: PostgreSQL telemetry cleanup incomplete.');
      process.exitCode = 1;
    }
  });
