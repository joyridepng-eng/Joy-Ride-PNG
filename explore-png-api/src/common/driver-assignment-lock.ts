import { Prisma, RideStatus } from '@prisma/client';

export const ACTIVE_DRIVER_RIDE_STATUSES: RideStatus[] = [
  RideStatus.ACCEPTED,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

// All ride/availability mutations for one driver use this transaction lock.
// ReadCommitted ensures queries AFTER a wait see the previous lock holder's commit.
export const DRIVER_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5000,
  timeout: 15000,
} as const;

export async function lockDriverAssignment(
  tx: Prisma.TransactionClient,
  driverId: string,
): Promise<void> {
  const key = `joyride:driver-assignment:${driverId}`;
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
  `;
}

export async function hasActiveDriverRide(
  tx: Pick<Prisma.TransactionClient, 'ride'>,
  driverId: string,
): Promise<boolean> {
  const ride = await tx.ride.findFirst({
    where: { driverId, status: { in: ACTIVE_DRIVER_RIDE_STATUSES } },
    select: { id: true },
  });
  return ride !== null;
}

// Read-side protection also covers incorrect flags left by older server versions.
export async function withEffectiveAvailability<
  T extends {
    id: string;
    status: string;
    isOnline: boolean;
    isAvailable: boolean;
  },
>(tx: Pick<Prisma.TransactionClient, 'ride'>, drivers: T[]): Promise<T[]> {
  if (drivers.length === 0) return drivers;
  const rides = await tx.ride.findMany({
    where: {
      driverId: { in: drivers.map((driver) => driver.id) },
      status: { in: ACTIVE_DRIVER_RIDE_STATUSES },
    },
    select: { driverId: true },
  });
  const busyDrivers = new Set(rides.map((ride) => ride.driverId));
  return drivers.map((driver) => ({
    ...driver,
    isAvailable:
      driver.status === 'APPROVED' &&
      driver.isOnline &&
      driver.isAvailable &&
      !busyDrivers.has(driver.id),
  }));
}
