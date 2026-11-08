import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const TEST_SERVICE_ZONE_ID = 'cmqxhlo8900009kripxj67urd';

const TEST_DRIVER_ID = 'cmqxiib050000dcrih388jp0a';

const TEST_VEHICLE_ID = 'cmqxiqfgs0002dcrioojju8uu';

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is missing. Check the environment configuration.',
    );
  }

  const pool = new Pool({
    connectionString,
  });

  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({
    adapter,
  });

  try {
    const serviceZone = await prisma.serviceZone.upsert({
      where: {
        id: TEST_SERVICE_ZONE_ID,
      },
      update: {
        name: 'Port Moresby Test Zone',
        kind: 'CITY',
        zoneKind: 'CITY',
        isAirportZone: false,
        isHotelZone: false,
        isPeripheryBuffer: false,
        status: 'ACTIVE',
        serviceStatus: 'ACTIVE',
        centerLatitude: -9.4438,
        centerLongitude: 147.1803,
        coverageRadiusKm: 15,
      },
      create: {
        id: TEST_SERVICE_ZONE_ID,
        name: 'Port Moresby Test Zone',
        kind: 'CITY',
        zoneKind: 'CITY',
        isAirportZone: false,
        isHotelZone: false,
        isPeripheryBuffer: false,
        status: 'ACTIVE',
        serviceStatus: 'ACTIVE',
        centerLatitude: -9.4438,
        centerLongitude: 147.1803,
        coverageRadiusKm: 15,
      },
    });

    const driver = await prisma.driver.upsert({
      where: {
        id: TEST_DRIVER_ID,
      },
      update: {
        fullName: 'Test Driver Two',
        phone: '+67570000002',
        email: 'test.driver.two@example.com',
        licenseNumber: 'PNG-TEST-002',
        status: 'APPROVED',
        isOnline: true,
        isAvailable: true,
        serviceZoneId: serviceZone.id,
      },
      create: {
        id: TEST_DRIVER_ID,
        fullName: 'Test Driver Two',
        phone: '+67570000002',
        email: 'test.driver.two@example.com',
        licenseNumber: 'PNG-TEST-002',
        status: 'APPROVED',
        isOnline: true,
        isAvailable: true,
        serviceZoneId: serviceZone.id,
      },
    });

    const vehicle = await prisma.vehicle.upsert({
      where: {
        id: TEST_VEHICLE_ID,
      },
      update: {
        plateNumber: 'PMV-002',
        make: 'Toyota',
        model: 'HiAce',
        color: 'White',
        seatCount: 10,
        status: 'ACTIVE',
        driverId: driver.id,
      },
      create: {
        id: TEST_VEHICLE_ID,
        plateNumber: 'PMV-002',
        make: 'Toyota',
        model: 'HiAce',
        color: 'White',
        seatCount: 10,
        status: 'ACTIVE',
        driverId: driver.id,
      },
    });

    console.log('Staging seed completed successfully.');
    console.log(`Service zone: ${serviceZone.id}`);
    console.log(`Driver: ${driver.id}`);
    console.log(`Vehicle: ${vehicle.id}`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Staging seed failed.');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});
