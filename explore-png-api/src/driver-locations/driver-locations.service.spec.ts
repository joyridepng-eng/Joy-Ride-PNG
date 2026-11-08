import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLocationsService } from './driver-locations.service';

const expectObjectContaining = (sample: Record<string, unknown>): unknown =>
  expect.objectContaining(sample) as unknown;

const expectAny = (constructor: unknown): unknown =>
  expect.any(constructor) as unknown;

describe('DriverLocationsService', () => {
  let service: DriverLocationsService;

  const prismaMock = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    driver: {
      findUnique: jest.fn(),
    },
    ride: {
      findUnique: jest.fn(),
    },
    driverLocation: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    driverLocationHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const driver = {
    id: 'driver-1',
    fullName: 'Test Driver',
    isOnline: true,
    isAvailable: true,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    service = new DriverLocationsService(
      prismaMock as unknown as PrismaService,
    );

    prismaMock.$transaction.mockImplementation(
      (callback: (tx: PrismaService) => unknown) =>
        Promise.resolve(callback(prismaMock as unknown as PrismaService)),
    );

    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.driver.findUnique.mockResolvedValue(driver);
    prismaMock.ride.findUnique.mockResolvedValue({
      driverId: 'driver-1',
    });
    prismaMock.driverLocation.findUnique.mockResolvedValue(null);
    prismaMock.driverLocationHistory.create.mockResolvedValue({
      id: 'history-1',
    });
    prismaMock.driverLocationHistory.findMany.mockResolvedValue([]);
  });

  describe('history', () => {
    it('returns chronological ride location history within a date range', async () => {
      const history = [
        {
          id: 'history-1',
          rideId: 'ride-1',
          driverId: 'driver-1',
          latitude: -9.4438,
          longitude: 147.1803,
          recordedAt: new Date('2026-07-05T01:30:00.000Z'),
        },
      ];

      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
      });
      prismaMock.driverLocationHistory.findMany.mockResolvedValue(history);

      const result = await service.history(
        {
          rideId: 'ride-1',
          from: '2026-07-05T01:00:00.000Z',
          to: '2026-07-05T02:00:00.000Z',
          limit: 100,
        },
        'driver-1',
      );

      expect(prismaMock.driverLocationHistory.findMany).toHaveBeenCalledWith({
        where: {
          rideId: 'ride-1',
          AND: [
            {
              recordedAt: {
                gte: new Date('2026-07-05T01:00:00.000Z'),
                lte: new Date('2026-07-05T02:00:00.000Z'),
              },
            },
          ],
        },
        orderBy: [
          {
            recordedAt: 'asc',
          },
          {
            id: 'asc',
          },
        ],
        take: 101,
      });

      expect(result).toEqual({
        items: history,
        nextCursor: null,
      });
    });

    it('returns a next cursor when another page exists', async () => {
      const first = {
        id: 'history-1',
        rideId: 'ride-1',
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.1803,
        recordedAt: new Date('2026-07-05T01:30:00.000Z'),
      };

      const second = {
        ...first,
        id: 'history-2',
        recordedAt: new Date('2026-07-05T01:31:00.000Z'),
      };

      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
      });
      prismaMock.driverLocationHistory.findMany.mockResolvedValue([
        first,
        second,
      ]);

      const result = await service.history(
        {
          rideId: 'ride-1',
          limit: 1,
        },
        'driver-1',
      );

      expect(result.items).toEqual([first]);
      expect(typeof result.nextCursor).toBe('string');

      const decodedCursor: unknown = JSON.parse(
        Buffer.from(result.nextCursor as string, 'base64url').toString('utf8'),
      );

      expect(decodedCursor).toEqual({
        recordedAt: first.recordedAt.toISOString(),
        id: first.id,
      });
    });

    it('applies the decoded cursor to recordedAt and id', async () => {
      const recordedAt = new Date('2026-07-05T01:30:00.000Z');
      const cursor = Buffer.from(
        JSON.stringify({
          recordedAt: recordedAt.toISOString(),
          id: 'history-1',
        }),
      ).toString('base64url');

      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
      });

      await service.history(
        {
          rideId: 'ride-1',
          cursor,
          limit: 500,
        },
        'driver-1',
      );

      expect(prismaMock.driverLocationHistory.findMany).toHaveBeenCalledWith({
        where: {
          rideId: 'ride-1',
          AND: [
            {
              recordedAt: {},
            },
            {
              OR: [
                {
                  recordedAt: {
                    gt: recordedAt,
                  },
                },
                {
                  recordedAt,
                  id: {
                    gt: 'history-1',
                  },
                },
              ],
            },
          ],
        },
        orderBy: [
          {
            recordedAt: 'asc',
          },
          {
            id: 'asc',
          },
        ],
        take: 501,
      });
    });

    it('rejects an invalid cursor', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
      });

      await expect(
        service.history(
          {
            rideId: 'ride-1',
            cursor: 'not-a-valid-cursor',
            limit: 500,
          },
          'driver-1',
        ),
      ).rejects.toThrow('Invalid history cursor');

      expect(prismaMock.driverLocationHistory.findMany).not.toHaveBeenCalled();
    });

    it('rejects history access for a different driver', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
      });

      await expect(
        service.history(
          {
            rideId: 'ride-1',
            limit: 500,
          },
          'driver-2',
        ),
      ).rejects.toThrow('Driver is not authorized to access this ride history');

      expect(prismaMock.driverLocationHistory.findMany).not.toHaveBeenCalled();
    });
    it('throws when the ride does not exist', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(null);

      await expect(
        service.history(
          {
            rideId: 'ride-missing',
            limit: 500,
          },
          'driver-1',
        ),
      ).rejects.toThrow('Ride not found');

      expect(prismaMock.driverLocationHistory.findMany).not.toHaveBeenCalled();
    });

    it('rejects a start time after the end time', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
      });

      await expect(
        service.history(
          {
            rideId: 'ride-1',
            from: '2026-07-05T03:00:00.000Z',
            to: '2026-07-05T02:00:00.000Z',
            limit: 500,
          },
          'driver-1',
        ),
      ).rejects.toThrow('History start time must not be after end time');

      expect(prismaMock.driverLocationHistory.findMany).not.toHaveBeenCalled();
    });
  });
  describe('upsert', () => {
    it('rejects updating another driver location', async () => {
      await expect(
        service.upsert(
          {
            driverId: 'driver-1',
            latitude: -9.4438,
            longitude: 147.1803,
          },
          'driver-2',
        ),
      ).rejects.toThrow('Driver cannot update another driver location');

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
    it('acquires a driver-scoped advisory lock before reading location state', async () => {
      const callOrder: string[] = [];

      prismaMock.$executeRaw.mockImplementation(() => {
        callOrder.push('lock');
        return Promise.resolve(1);
      });

      prismaMock.driver.findUnique.mockImplementation(() => {
        callOrder.push('driver');
        return Promise.resolve(driver);
      });

      prismaMock.driverLocation.findUnique.mockImplementation(() => {
        callOrder.push('location');
        return Promise.resolve(null);
      });

      prismaMock.driverLocation.upsert.mockImplementation(() => {
        callOrder.push('upsert');

        return Promise.resolve({
          id: 'location-1',
          driverId: 'driver-1',
          latitude: -9.4438,
          longitude: 147.1803,
        });
      });

      await service.upsert({
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.1803,
        recordedAt: '2026-07-05T01:30:00.000Z',
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual(['lock', 'driver', 'location', 'upsert']);
    });
    it('creates or updates the current location with a device timestamp', async () => {
      const recordedAt = '2026-07-05T01:30:00.000Z';
      const recordedAtDate = new Date(recordedAt);

      const savedLocation = {
        id: 'location-1',
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.1803,
        heading: 90,
        speed: 12.5,
        accuracy: 5,
        recordedAt: recordedAtDate,
        driver,
      };

      prismaMock.driverLocation.upsert.mockResolvedValue(savedLocation);

      const result = await service.upsert({
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.1803,
        heading: 90,
        speed: 12.5,
        accuracy: 5,
        recordedAt,
      });

      expect(prismaMock.driver.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
        },
      });

      expect(prismaMock.driverLocation.findUnique).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-1',
        },
        select: {
          recordedAt: true,
        },
      });

      expect(prismaMock.driverLocation.upsert).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-1',
        },
        update: {
          latitude: -9.4438,
          longitude: 147.1803,
          heading: 90,
          speed: 12.5,
          accuracy: 5,
          recordedAt: recordedAtDate,
        },
        create: {
          driverId: 'driver-1',
          latitude: -9.4438,
          longitude: 147.1803,
          heading: 90,
          speed: 12.5,
          accuracy: 5,
          recordedAt: recordedAtDate,
        },
        include: {
          driver: {
            select: {
              id: true,
              fullName: true,
              isOnline: true,
              isAvailable: true,
            },
          },
        },
      });

      expect(result).toEqual(savedLocation);
    });

    it('appends an accepted location update to history', async () => {
      const recordedAt = '2026-07-05T01:30:00.000Z';

      prismaMock.driverLocation.upsert.mockResolvedValue({
        id: 'location-1',
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.1803,
      });

      await service.upsert({
        driverId: 'driver-1',
        rideId: 'ride-1',
        latitude: -9.4438,
        longitude: 147.1803,
        heading: 90,
        speed: 12.5,
        accuracy: 5,
        recordedAt,
      });

      expect(prismaMock.driverLocationHistory.create).toHaveBeenCalledWith({
        data: {
          driverId: 'driver-1',
          rideId: 'ride-1',
          latitude: -9.4438,
          longitude: 147.1803,
          heading: 90,
          speed: 12.5,
          accuracy: 5,
          recordedAt: new Date(recordedAt),
        },
      });
    });

    it('rejects a location update when the ride does not exist', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(null);

      await expect(
        service.upsert({
          driverId: 'driver-1',
          rideId: 'ride-missing',
          latitude: -9.4438,
          longitude: 147.1803,
        }),
      ).rejects.toThrow('Ride not found');

      expect(prismaMock.driverLocation.upsert).not.toHaveBeenCalled();
      expect(prismaMock.driverLocationHistory.create).not.toHaveBeenCalled();
    });

    it('rejects a location update when the ride belongs to another driver', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        driverId: 'driver-2',
      });

      await expect(
        service.upsert({
          driverId: 'driver-1',
          rideId: 'ride-1',
          latitude: -9.4438,
          longitude: 147.1803,
        }),
      ).rejects.toThrow('Ride is not assigned to this driver');

      expect(prismaMock.driverLocation.upsert).not.toHaveBeenCalled();
      expect(prismaMock.driverLocationHistory.create).not.toHaveBeenCalled();
    });

    it('accepts a location update when the ride belongs to the driver', async () => {
      prismaMock.driverLocation.upsert.mockResolvedValue({
        id: 'location-1',
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.1803,
      });

      await service.upsert({
        driverId: 'driver-1',
        rideId: 'ride-1',
        latitude: -9.4438,
        longitude: 147.1803,
      });

      expect(prismaMock.ride.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'ride-1',
        },
        select: {
          driverId: true,
        },
      });

      expect(prismaMock.driverLocationHistory.create).toHaveBeenCalled();
    });
    it('does not append history for a stale location update', async () => {
      prismaMock.driverLocation.findUnique.mockResolvedValue({
        recordedAt: new Date('2026-07-05T01:35:00.000Z'),
      });

      await expect(
        service.upsert({
          driverId: 'driver-1',
          rideId: 'ride-1',
          latitude: -9.4438,
          longitude: 147.1803,
          recordedAt: '2026-07-05T01:30:00.000Z',
        }),
      ).rejects.toThrow(
        'Location update is older than the current driver location',
      );

      expect(prismaMock.driverLocationHistory.create).not.toHaveBeenCalled();
    });
    it('uses the server time when recordedAt is omitted', async () => {
      prismaMock.driverLocation.upsert.mockResolvedValue({
        id: 'location-1',
        driverId: 'driver-1',
        latitude: -9.44,
        longitude: 147.18,
      });

      await service.upsert({
        driverId: 'driver-1',
        latitude: -9.44,
        longitude: 147.18,
      });

      expect(prismaMock.driverLocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expectObjectContaining({
            recordedAt: expectAny(Date),
          }),
          create: expectObjectContaining({
            recordedAt: expectAny(Date),
          }),
        }),
      );
    });

    it('supports location updates without optional telemetry', async () => {
      const recordedAt = '2026-07-05T01:30:00.000Z';

      prismaMock.driverLocation.upsert.mockResolvedValue({
        id: 'location-1',
        driverId: 'driver-1',
        latitude: -9.44,
        longitude: 147.18,
        heading: null,
        speed: null,
        accuracy: null,
        recordedAt: new Date(recordedAt),
      });

      await service.upsert({
        driverId: 'driver-1',
        latitude: -9.44,
        longitude: 147.18,
        recordedAt,
      });

      expect(prismaMock.driverLocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: {
            latitude: -9.44,
            longitude: 147.18,
            heading: undefined,
            speed: undefined,
            accuracy: undefined,
            recordedAt: new Date(recordedAt),
          },
          create: {
            driverId: 'driver-1',
            latitude: -9.44,
            longitude: 147.18,
            heading: undefined,
            speed: undefined,
            accuracy: undefined,
            recordedAt: new Date(recordedAt),
          },
        }),
      );
    });

    it('rejects an update older than the stored location', async () => {
      prismaMock.driverLocation.findUnique.mockResolvedValue({
        recordedAt: new Date('2026-07-05T01:35:00.000Z'),
      });

      await expect(
        service.upsert({
          driverId: 'driver-1',
          latitude: -9.4438,
          longitude: 147.1803,
          recordedAt: '2026-07-05T01:30:00.000Z',
        }),
      ).rejects.toThrow(
        'Location update is older than the current driver location',
      );

      expect(prismaMock.driverLocation.upsert).not.toHaveBeenCalled();
    });

    it('throws when the driver does not exist', async () => {
      prismaMock.driver.findUnique.mockResolvedValue(null);

      await expect(
        service.upsert({
          driverId: 'missing-driver',
          latitude: -9.4438,
          longitude: 147.1803,
        }),
      ).rejects.toThrow(NotFoundException);

      await expect(
        service.upsert({
          driverId: 'missing-driver',
          latitude: -9.4438,
          longitude: 147.1803,
        }),
      ).rejects.toThrow('Driver not found');

      expect(prismaMock.driverLocation.findUnique).not.toHaveBeenCalled();

      expect(prismaMock.driverLocation.upsert).not.toHaveBeenCalled();
    });

    it('passes updated heading, speed, and accuracy values', async () => {
      prismaMock.driverLocation.upsert.mockResolvedValue({
        id: 'location-1',
        driverId: 'driver-1',
        latitude: -9.45,
        longitude: 147.19,
        heading: 180,
        speed: 20,
        accuracy: 3,
      });

      await service.upsert({
        driverId: 'driver-1',
        latitude: -9.45,
        longitude: 147.19,
        heading: 180,
        speed: 20,
        accuracy: 3,
      });

      expect(prismaMock.driverLocation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expectObjectContaining({
            heading: 180,
            speed: 20,
            accuracy: 3,
          }),
        }),
      );
    });
  });
});
