import { DriverStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLocationsService } from './driver-locations.service';

function setup() {
  const findMany = jest
    .fn<Promise<unknown[]>, [Prisma.DriverLocationFindManyArgs]>()
    .mockResolvedValue([]);
  const service = new DriverLocationsService({
    driverLocation: { findMany },
  } as unknown as PrismaService);
  return { service, findMany };
}

describe('Live Fleet driver visibility', () => {
  it('excludes INACTIVE drivers at the database query', async () => {
    const { service, findMany } = setup();
    await service.fleet();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      driver: { status: { not: DriverStatus.INACTIVE } },
    });
  });

  it('returns status alongside existing public fleet driver fields', async () => {
    const { service, findMany } = setup();
    await service.fleet();
    expect(findMany.mock.calls[0][0].include).toEqual({
      driver: {
        select: {
          id: true,
          fullName: true,
          status: true,
          isOnline: true,
          isAvailable: true,
        },
      },
    });
  });

  it('supports an empty visible fleet', async () => {
    const { service } = setup();
    await expect(service.fleet()).resolves.toEqual([]);
  });

  it('propagates query failure instead of reporting an empty success', async () => {
    const { service, findMany } = setup();
    const failure = new Error('Synthetic query failure');
    findMany.mockRejectedValueOnce(failure);
    await expect(service.fleet()).rejects.toBe(failure);
  });
});
