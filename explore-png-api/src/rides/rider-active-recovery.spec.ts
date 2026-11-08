import 'reflect-metadata';
import { RequestMethod, UnauthorizedException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RiderJwtAuthGuard } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import { RideStatus } from '@prisma/client';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';

type ActiveRideQuery = {
  where: { riderId: string; status: { in: RideStatus[] } };
  orderBy: Array<{ createdAt?: 'desc'; id?: 'desc' }>;
  include: { driver: boolean; vehicle: boolean };
};

const activeStatuses = [
  RideStatus.REQUESTED,
  RideStatus.ACCEPTED,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

describe('Rider active-ride recovery', () => {
  function setup() {
    const findFirst = jest.fn<Promise<unknown>, [ActiveRideQuery]>();
    const include = { driver: true, vehicle: true };
    const service = Object.create(RidesService.prototype) as RidesService;
    Object.assign(service, {
      prisma: { ride: { findFirst } },
      defaultInclude: () => include,
    });
    return { service, findFirst, include };
  }

  it('queries only the authenticated rider and all four active statuses', async () => {
    const { service, findFirst, include } = setup();
    const ride = {
      id: 'test-ride',
      riderId: 'test-rider',
      status: RideStatus.REQUESTED,
    };
    findFirst.mockResolvedValue(ride);
    await expect(service.findActiveRiderRide('test-rider')).resolves.toBe(ride);
    expect(findFirst).toHaveBeenCalledWith({
      where: { riderId: 'test-rider', status: { in: activeStatuses } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include,
    });
  });

  it('does not include terminal statuses', async () => {
    const { service, findFirst } = setup();
    findFirst.mockResolvedValue(null);
    await service.findActiveRiderRide('test-rider');
    const statuses = findFirst.mock.calls[0][0].where.status.in;
    for (const terminal of [
      RideStatus.COMPLETED,
      RideStatus.CANCELLED,
      RideStatus.NO_DRIVER_AVAILABLE,
    ])
      expect(statuses).not.toContain(terminal);
  });

  it('returns null when the rider has no active ride', async () => {
    const { service, findFirst } = setup();
    findFirst.mockResolvedValue(null);
    await expect(service.findActiveRiderRide('test-rider')).resolves.toBeNull();
  });

  it('keeps lookup failure distinct from no active ride', async () => {
    const { service, findFirst } = setup();
    findFirst.mockRejectedValue(new Error('Synthetic lookup failure'));
    await expect(service.findActiveRiderRide('test-rider')).rejects.toThrow();
  });

  it('changes the ownership filter when another account is queried', async () => {
    const { service, findFirst } = setup();
    findFirst.mockResolvedValue(null);
    await service.findActiveRiderRide('test-rider-a');
    await service.findActiveRiderRide('test-rider-b');
    expect(findFirst.mock.calls[1][0].where.riderId).toBe('test-rider-b');
  });

  it('uses the authenticated identity rather than a supplied rider identifier', async () => {
    const findActiveRiderRide = jest
      .fn<Promise<null>, [string]>()
      .mockResolvedValue(null);
    const controller = new RidesController({
      findActiveRiderRide,
    } as unknown as RidesService);
    const request = {
      rider: { id: 'authenticated-test-rider' },
      query: { riderId: 'different-test-rider' },
    } as unknown as Parameters<RidesController['findMyActiveRiderRide']>[0];
    await controller.findMyActiveRiderRide(request);
    expect(findActiveRiderRide).toHaveBeenCalledWith(
      'authenticated-test-rider',
    );
  });

  it('rejects a request without an authenticated rider', () => {
    const findActiveRiderRide = jest.fn<Promise<null>, [string]>();
    const controller = new RidesController({
      findActiveRiderRide,
    } as unknown as RidesService);
    expect(() =>
      controller.findMyActiveRiderRide(
        {} as Parameters<RidesController['findMyActiveRiderRide']>[0],
      ),
    ).toThrow(UnauthorizedException);
    expect(findActiveRiderRide).not.toHaveBeenCalled();
  });

  it('registers the GET me/active route with the Rider guard', () => {
    const handler = Object.getOwnPropertyDescriptor(
      RidesController.prototype,
      'findMyActiveRiderRide',
    )?.value as unknown as (...args: unknown[]) => unknown;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('me/active');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
      RiderJwtAuthGuard,
    );
  });
});
