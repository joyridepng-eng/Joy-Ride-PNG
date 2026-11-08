/*
 * Controller methods are passed as metadata targets and are never
 * invoked as unbound functions.
 */
/* eslint-disable @typescript-eslint/unbound-method */
import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

describe('DriversController authorization', () => {
  const driversServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findNearby: jest.fn(),
    findOne: jest.fn(),
    updateAvailability: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  let controller: DriversController;

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new DriversController(
      driversServiceMock as unknown as DriversService,
    );
  });

  function guardsFor(method: (...args: never[]) => unknown): unknown[] {
    return (
      (Reflect.getMetadata(GUARDS_METADATA, method) as unknown[] | undefined) ??
      []
    );
  }

  it('protects the Driver profile route with Driver JWT authentication', () => {
    expect(guardsFor(DriversController.prototype.findMe)).toContain(
      DriverJwtAuthGuard,
    );
  });

  it('protects Driver availability with Driver JWT authentication', () => {
    expect(
      guardsFor(DriversController.prototype.updateMyAvailability),
    ).toContain(DriverJwtAuthGuard);
  });

  it('keeps administrator Driver lookup protected by Admin authentication', () => {
    expect(guardsFor(DriversController.prototype.findOne)).toContain(
      AdminJwtAuthGuard,
    );
  });

  it('uses the authenticated Driver identity for profile lookup', async () => {
    driversServiceMock.findOne.mockResolvedValue({
      id: 'driver-1',
    });

    const request = {
      driver: {
        id: 'driver-1',
        fullName: 'Test Driver',
        phone: '+67570000001',
        email: null,
      },
    } as DriverAuthenticatedRequest;

    await controller.findMe(request);

    expect(driversServiceMock.findOne).toHaveBeenCalledWith('driver-1');
  });

  it('uses the authenticated Driver identity for availability updates', async () => {
    driversServiceMock.updateAvailability.mockResolvedValue({
      id: 'driver-1',
      isOnline: true,
      isAvailable: true,
    });

    const request = {
      driver: {
        id: 'driver-1',
        fullName: 'Test Driver',
        phone: '+67570000001',
        email: null,
      },
    } as DriverAuthenticatedRequest;

    const dto = {
      isOnline: true,
      isAvailable: true,
    };

    await controller.updateMyAvailability(request, dto);

    expect(driversServiceMock.updateAvailability).toHaveBeenCalledWith(
      'driver-1',
      dto,
    );
  });

  it('rejects direct invocation without an authenticated Driver', () => {
    const request = {} as DriverAuthenticatedRequest;

    expect(() => controller.findMe(request)).toThrow(UnauthorizedException);

    expect(driversServiceMock.findOne).not.toHaveBeenCalled();
  });
});
