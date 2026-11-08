import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { DriverStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLocationReplayService } from './driver-location-replay.service';

describe('DriverLocationReplayService', () => {
  const point = {
    id: 'point_0123456789abcdef',
    rideId: 'ride-test',
    latitude: -9.44,
    longitude: 147.18,
    recordedAt: '2026-01-01T00:00:00.000Z',
  };

  const rows = new Map<string, Record<string, unknown>>();
  const tx = {
    driver: { findUnique: jest.fn() },
    ride: { findMany: jest.fn() },
    driverLocation: { upsert: jest.fn() },
    driverLocationHistory: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const prisma = { $transaction: jest.fn() };
  let service: DriverLocationReplayService;

  beforeEach(() => {
    jest.resetAllMocks();
    rows.clear();
    service = new DriverLocationReplayService(
      prisma as unknown as PrismaService,
    );
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    tx.driver.findUnique.mockResolvedValue({
      id: 'driver-test',
      status: DriverStatus.APPROVED,
    });
    tx.ride.findMany.mockResolvedValue([
      { id: 'ride-test', driverId: 'driver-test' },
    ]);
    tx.driverLocationHistory.createMany.mockImplementation(
      ({ data }: { data: Array<Record<string, unknown> & { id: string }> }) => {
        let count = 0;
        for (const row of data) {
          if (!rows.has(row.id)) {
            rows.set(row.id, row);
            count++;
          }
        }
        return Promise.resolve({ count });
      },
    );
    tx.driverLocationHistory.findMany.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id) => rows.get(id)).filter(Boolean)),
    );
  });

  it('stores historical points without changing the live location', async () => {
    expect(await service.replay({ points: [point] }, 'driver-test')).toEqual({
      acceptedIds: [point.id],
    });
    expect(rows.size).toBe(1);
    expect(tx.driverLocation.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'Serializable' }),
    );
  });

  it('acknowledges an identical retry without adding a second row', async () => {
    await service.replay({ points: [point] }, 'driver-test');
    await service.replay({ points: [point] }, 'driver-test');
    expect(rows.size).toBe(1);
  });

  it('rejects reuse of an identifier with different contents', async () => {
    await service.replay({ points: [point] }, 'driver-test');
    await expect(
      service.replay(
        {
          points: [{ ...point, longitude: 148 }],
        },
        'driver-test',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects another driver ride before writing history', async () => {
    tx.ride.findMany.mockResolvedValue([
      { id: point.rideId, driverId: 'another-driver' },
    ]);
    await expect(
      service.replay({ points: [point] }, 'driver-test'),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.driverLocationHistory.createMany).not.toHaveBeenCalled();
  });

  it('rejects a missing ride before writing history', async () => {
    tx.ride.findMany.mockResolvedValue([]);
    await expect(
      service.replay({ points: [point] }, 'driver-test'),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.driverLocationHistory.createMany).not.toHaveBeenCalled();
  });

  it('rejects a missing authenticated driver', async () => {
    await expect(service.replay({ points: [point] }, '')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an unapproved driver', async () => {
    tx.driver.findUnique.mockResolvedValue(null);
    await expect(
      service.replay({ points: [point] }, 'driver-test'),
    ).rejects.toThrow(ForbiddenException);
    expect(tx.driverLocationHistory.createMany).not.toHaveBeenCalled();
  });

  it('rejects duplicate point identifiers within one batch', async () => {
    await expect(
      service.replay(
        {
          points: [point, point],
        },
        'driver-test',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects empty and oversized batches', async () => {
    await expect(service.replay({ points: [] }, 'driver-test')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.replay(
        {
          points: Array.from({ length: 101 }, () => point),
        },
        'driver-test',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid coordinates and future timestamps', async () => {
    for (const invalid of [
      { ...point, latitude: 91 },
      { ...point, longitude: NaN },
      { ...point, heading: 360 },
      { ...point, speed: -1 },
      { ...point, recordedAt: 'invalid' },
      { ...point, recordedAt: new Date(Date.now() + 600000).toISOString() },
    ]) {
      await expect(
        service.replay(
          {
            points: [invalid],
          },
          'driver-test',
        ),
      ).rejects.toThrow(BadRequestException);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
