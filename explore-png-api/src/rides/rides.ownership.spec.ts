import { NotFoundException } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from '../routing/routing.service';
import { RidesService } from './rides.service';

describe('Ride ownership boundaries', () => {
  const records = [
    {
      id: 'ride-a',
      riderId: 'rider-a',
      driverId: 'driver-a',
      status: RideStatus.ACCEPTED,
    },
    {
      id: 'ride-b',
      riderId: 'rider-b',
      driverId: 'driver-b',
      status: RideStatus.ACCEPTED,
    },
  ];

  const prisma = {
    ride: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let service: RidesService;

  beforeEach(() => {
    jest.resetAllMocks();

    prisma.$executeRaw.mockResolvedValue(0);
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );

    // Simulate filtering against two distinct owners.
    // Omitting the ownership filter must not automatically return null.
    prisma.ride.findFirst.mockImplementation(
      ({ where }: { where: { id: string; riderId?: string } }) =>
        Promise.resolve(
          records.find(
            (ride) =>
              ride.id === where.id &&
              (where.riderId === undefined || ride.riderId === where.riderId),
          ) ?? null,
        ),
    );

    prisma.ride.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(records.find((ride) => ride.id === where.id) ?? null),
    );

    service = new RidesService(
      prisma as unknown as PrismaService,
      {} as RoutingService,
      {} as NotificationsService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['ride-a', 'rider-a'],
    ['ride-b', 'rider-b'],
  ])('allows owner %s / %s to read their ride', async (id, riderId) => {
    await expect(service.findRiderRide(id, riderId)).resolves.toEqual(
      expect.objectContaining({ id, riderId }),
    );
  });

  it.each([
    ['ride-a', 'rider-b'],
    ['ride-b', 'rider-a'],
    ['missing-ride', 'rider-a'],
  ])('blocks ride read %s / %s', async (id, riderId) => {
    await expect(service.findRiderRide(id, riderId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each([
    ['ride-a', 'rider-b'],
    ['ride-b', 'rider-a'],
    ['missing-ride', 'rider-a'],
  ])(
    'blocks location read %s / %s before loading location',
    async (id, riderId) => {
      const lookup = jest.spyOn(service, 'getCurrentLocation');

      await expect(
        service.getRiderCurrentLocation(id, riderId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['ride-a', 'rider-b'],
    ['ride-b', 'rider-a'],
    ['missing-ride', 'rider-a'],
  ])(
    'blocks receipt read %s / %s before loading settlement',
    async (id, riderId) => {
      const lookup = jest.spyOn(service, 'getSettlement');

      await expect(
        service.getRiderSettlement(id, riderId),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(lookup).not.toHaveBeenCalled();
    },
  );

  it('allows the owner through to the location lookup', async () => {
    const result = {
      rideId: 'ride-a',
    } as Awaited<ReturnType<RidesService['getCurrentLocation']>>;

    const lookup = jest
      .spyOn(service, 'getCurrentLocation')
      .mockResolvedValue(result);

    await expect(
      service.getRiderCurrentLocation('ride-a', 'rider-a'),
    ).resolves.toBe(result);

    expect(lookup).toHaveBeenCalledWith('ride-a');
  });

  it('allows the owner through to the settlement lookup', async () => {
    const result = {} as Awaited<ReturnType<RidesService['getSettlement']>>;

    const lookup = jest
      .spyOn(service, 'getSettlement')
      .mockResolvedValue(result);

    await expect(service.getRiderSettlement('ride-a', 'rider-a')).resolves.toBe(
      result,
    );

    expect(lookup).toHaveBeenCalledWith('ride-a');
  });

  it.each([
    ['ride-a', 'driver-b'],
    ['ride-b', 'driver-a'],
    ['missing-ride', 'driver-a'],
  ])(
    'blocks unauthorized status change %s / %s before any ride mutation',
    async (id, driverId) => {
      await expect(
        service.updateDriverRideStatus(id, driverId, {
          status: RideStatus.DRIVER_ARRIVED,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      const existingRide = records.some((ride) => ride.id === id);
      expect(prisma.$transaction).toHaveBeenCalledTimes(existingRide ? 1 : 0);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(existingRide ? 1 : 0);
      expect(prisma.ride.update).not.toHaveBeenCalled();
      expect(prisma.ride.updateMany).not.toHaveBeenCalled();
    },
  );
});
