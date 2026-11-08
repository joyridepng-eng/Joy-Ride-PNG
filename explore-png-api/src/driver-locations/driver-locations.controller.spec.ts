/*
 * Controller methods are passed as metadata targets and are never
 * invoked as unbound functions.
 */
/* eslint-disable @typescript-eslint/unbound-method */
import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverLocationsController } from './driver-locations.controller';
import { DriverLocationsService } from './driver-locations.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';

describe('DriverLocationsController authorization', () => {
  const driverLocationsServiceMock = {
    fleet: jest.fn(),
    history: jest.fn(),
    upsert: jest.fn(),
  };

  let controller: DriverLocationsController;

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new DriverLocationsController(
      driverLocationsServiceMock as unknown as DriverLocationsService,
    );
  });

  function guardsFor(method: (...args: never[]) => unknown): unknown[] {
    return (
      (Reflect.getMetadata(GUARDS_METADATA, method) as unknown[] | undefined) ??
      []
    );
  }

  function authenticatedRequest(): DriverAuthenticatedRequest {
    return {
      driver: {
        id: 'driver-1',
        fullName: 'Test Driver',
        phone: '+67570000001',
        email: null,
      },
    } as DriverAuthenticatedRequest;
  }

  it('protects location history with Driver JWT authentication', () => {
    expect(guardsFor(DriverLocationsController.prototype.history)).toContain(
      DriverJwtAuthGuard,
    );
  });

  it('protects location updates with Driver JWT authentication', () => {
    expect(guardsFor(DriverLocationsController.prototype.upsert)).toContain(
      DriverJwtAuthGuard,
    );
  });

  it('keeps fleet tracking protected by Admin authentication', () => {
    expect(guardsFor(DriverLocationsController.prototype.fleet)).toContain(
      AdminJwtAuthGuard,
    );
  });

  it('uses the authenticated Driver identity for history', async () => {
    driverLocationsServiceMock.history.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    const query = {
      rideId: 'ride-1',
      limit: 500,
    };

    await controller.history(query, authenticatedRequest());

    expect(driverLocationsServiceMock.history).toHaveBeenCalledWith(
      query,
      'driver-1',
    );
  });

  it('injects the authenticated Driver identity into location updates', async () => {
    driverLocationsServiceMock.upsert.mockResolvedValue({
      id: 'location-1',
      driverId: 'driver-1',
    });

    const dto = {
      rideId: 'ride-1',
      latitude: -9.4438,
      longitude: 147.1803,
      heading: 90,
      speed: 12.5,
      accuracy: 5,
      recordedAt: '2026-08-28T10:00:00.000Z',
    };

    await controller.upsert(dto, authenticatedRequest());

    expect(driverLocationsServiceMock.upsert).toHaveBeenCalledWith(
      {
        ...dto,
        driverId: 'driver-1',
      },
      'driver-1',
    );
  });

  it('rejects direct location updates without an authenticated Driver', () => {
    const request = {} as DriverAuthenticatedRequest;

    expect(() =>
      controller.upsert(
        {
          latitude: -9.4438,
          longitude: 147.1803,
        },
        request,
      ),
    ).toThrow(UnauthorizedException);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });
});
