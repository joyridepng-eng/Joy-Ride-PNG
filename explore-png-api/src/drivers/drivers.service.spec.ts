import { NotFoundException } from '@nestjs/common';
import { DriverStatus, ServiceStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriversService } from './drivers.service';

const expectObjectContaining = (sample: Record<string, unknown>): unknown =>
  expect.objectContaining(sample) as unknown;

const expectAny = (constructor: unknown): unknown =>
  expect.any(constructor) as unknown;

describe('DriversService', () => {
  let service: DriversService;

  const prismaMock = {
    driver: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    vehicle: {
      updateMany: jest.fn(),
    },
    ride: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const baseDriver = {
    id: 'driver-1',
    fullName: 'Test Driver',
    phone: '+67570000001',
    email: 'driver@example.com',
    licenseNumber: 'LIC-001',
    licenseClass: 'Class 6',
    licenseIssuedAt: new Date('2024-01-01T00:00:00.000Z'),
    licenseExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '+67570000099',
    emergencyContactRelationship: 'Sibling',
    approvedAt: new Date('2025-01-01T00:00:00.000Z'),
    approvedBy: null,
    suspensionReason: null,
    status: DriverStatus.APPROVED,
    isOnline: true,
    isAvailable: true,
    locationId: 1,
    serviceZoneId: 'zone-1',
    location: {
      id: 1,
      name: 'Port Moresby',
      serviceStatus: ServiceStatus.ACTIVE,
    },
    serviceZone: {
      id: 'zone-1',
      name: 'Port Moresby Test Zone',
      serviceStatus: ServiceStatus.ACTIVE,
    },
    locationPing: {
      latitude: -9.4438,
      longitude: 147.1803,
      accuracy: 5,
      heading: 90,
      speed: 10,
      recordedAt: new Date(),
    },
    vehicles: [
      {
        id: 'vehicle-1',
        plateNumber: 'PMV-001',
        status: VehicleStatus.ACTIVE,
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();

    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.ride.findFirst.mockResolvedValue(null);
    prismaMock.ride.findMany.mockResolvedValue([]);

    prismaMock.$transaction.mockImplementation(
      (callback: (tx: PrismaService) => unknown) =>
        callback(prismaMock as unknown as PrismaService),
    );

    service = new DriversService(prismaMock as unknown as PrismaService);
  });

  describe('normalization', () => {
    it('normalizes driver identity fields during creation', async () => {
      prismaMock.driver.create.mockResolvedValue(baseDriver);

      await service.create({
        fullName: '  Test Driver  ',
        phone: '  +67570000001  ',
        email: '  DRIVER@EXAMPLE.COM  ',
        licenseNumber: '  lic-001  ',
        licenseClass: '  Class 6  ',
        emergencyContactName: '  Emergency Contact  ',
        emergencyContactPhone: '  +67570000099  ',
        emergencyContactRelationship: '  Sibling  ',
      });

      expect(prismaMock.driver.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expectObjectContaining({
            fullName: 'Test Driver',
            phone: '+67570000001',
            email: 'driver@example.com',
            licenseNumber: 'LIC-001',
            licenseClass: 'Class 6',
            emergencyContactName: 'Emergency Contact',
            emergencyContactPhone: '+67570000099',
            emergencyContactRelationship: 'Sibling',
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns a driver when the driver exists', async () => {
      prismaMock.driver.findUnique.mockResolvedValue(baseDriver);

      const result = await service.findOne('driver-1');

      expect(prismaMock.driver.findUnique).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });

      expect(result).toEqual(baseDriver);
    });

    it('throws when the driver does not exist', async () => {
      prismaMock.driver.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing-driver')).rejects.toThrow(
        NotFoundException,
      );

      await expect(service.findOne('missing-driver')).rejects.toThrow(
        'Driver not found',
      );
    });
  });

  describe('lifecycle invariants', () => {
    it('forces a non-approved driver offline and unavailable when created', async () => {
      prismaMock.driver.create.mockResolvedValue({
        ...baseDriver,
        status: DriverStatus.PENDING,
        isOnline: false,
        isAvailable: false,
      });

      await service.create({
        fullName: 'Pending Driver',
        phone: '+67570000002',
      });

      expect(prismaMock.driver.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expectObjectContaining({
            status: DriverStatus.PENDING,
            isOnline: false,
            isAvailable: false,
          }),
        }),
      );
    });

    it.each([DriverStatus.SUSPENDED, DriverStatus.INACTIVE])(
      'forces a %s driver offline and unavailable when status changes',
      async (status) => {
        prismaMock.driver.findUnique.mockResolvedValue(baseDriver);

        prismaMock.driver.update.mockResolvedValue({
          ...baseDriver,
          status,
          isOnline: false,
          isAvailable: false,
        });

        await service.update('driver-1', {
          status,
        });

        expect(prismaMock.driver.update).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: 'driver-1' },
            data: expectObjectContaining({
              status,
              isOnline: false,
              isAvailable: false,
            }),
          }),
        );
      },
    );

    it.each([
      DriverStatus.PENDING,
      DriverStatus.SUSPENDED,
      DriverStatus.INACTIVE,
    ])('rejects a %s driver attempting to go online', async (status) => {
      prismaMock.driver.findUnique.mockResolvedValue({
        ...baseDriver,
        status,
        isOnline: false,
        isAvailable: false,
      });

      await expect(
        service.updateAvailability('driver-1', {
          isOnline: true,
          isAvailable: true,
        }),
      ).rejects.toThrow('Only approved drivers can be online or available');

      expect(prismaMock.driver.update).not.toHaveBeenCalled();
    });

    it('allows a suspended driver to be forced offline', async () => {
      prismaMock.driver.findUnique.mockResolvedValue({
        ...baseDriver,
        status: DriverStatus.SUSPENDED,
        isOnline: true,
        isAvailable: true,
      });

      prismaMock.driver.update.mockResolvedValue({
        ...baseDriver,
        status: DriverStatus.SUSPENDED,
        isOnline: false,
        isAvailable: false,
      });

      await service.updateAvailability('driver-1', {
        isOnline: false,
      });

      expect(prismaMock.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          isOnline: false,
          isAvailable: false,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });
    });
  });
  describe('updateAvailability', () => {
    it('forces availability to false when the driver goes offline', async () => {
      prismaMock.driver.findUnique.mockResolvedValue(baseDriver);

      prismaMock.driver.update.mockResolvedValue({
        ...baseDriver,
        isOnline: false,
        isAvailable: false,
      });

      const result = await service.updateAvailability('driver-1', {
        isOnline: false,
      });

      expect(prismaMock.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          isOnline: false,
          isAvailable: false,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });

      expect(result.isOnline).toBe(false);
      expect(result.isAvailable).toBe(false);
    });

    it('allows an online driver to become available', async () => {
      prismaMock.driver.findUnique.mockResolvedValue({
        ...baseDriver,
        isOnline: false,
        isAvailable: false,
      });

      prismaMock.driver.update.mockResolvedValue({
        ...baseDriver,
        isOnline: true,
        isAvailable: true,
      });

      const result = await service.updateAvailability('driver-1', {
        isOnline: true,
        isAvailable: true,
      });

      expect(prismaMock.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          isOnline: true,
          isAvailable: true,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });

      expect(result.isOnline).toBe(true);
      expect(result.isAvailable).toBe(true);
    });

    it('preserves current availability when only online status is supplied', async () => {
      prismaMock.driver.findUnique.mockResolvedValue({
        ...baseDriver,
        isOnline: true,
        isAvailable: true,
      });

      prismaMock.driver.update.mockResolvedValue(baseDriver);

      await service.updateAvailability('driver-1', {
        isOnline: true,
      });

      expect(prismaMock.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          isOnline: true,
          isAvailable: true,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });
    });
  });

  describe('findNearby', () => {
    it('returns nearby drivers sorted by distance', async () => {
      const nearerDriver = {
        ...baseDriver,
        id: 'driver-near',
        fullName: 'Near Driver',
        locationPing: {
          latitude: -9.444,
          longitude: 147.181,
        },
      };

      const fartherDriver = {
        ...baseDriver,
        id: 'driver-far',
        fullName: 'Far Driver',
        locationPing: {
          latitude: -9.46,
          longitude: 147.2,
        },
      };

      prismaMock.driver.findMany.mockResolvedValue([
        fartherDriver,
        nearerDriver,
      ]);

      const result = await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 10,
      } as Parameters<DriversService['findNearby']>[0]);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('driver-near');
      expect(result[1].id).toBe('driver-far');

      expect(result[0].distanceKm).toBeLessThan(result[1].distanceKm);
    });

    it('excludes drivers outside the requested radius', async () => {
      const nearbyDriver = {
        ...baseDriver,
        id: 'driver-near',
        locationPing: {
          latitude: -9.444,
          longitude: 147.181,
        },
      };

      const distantDriver = {
        ...baseDriver,
        id: 'driver-distant',
        locationPing: {
          latitude: -9.6,
          longitude: 147.3,
        },
      };

      prismaMock.driver.findMany.mockResolvedValue([
        nearbyDriver,
        distantDriver,
      ]);

      const result = await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
      } as Parameters<DriversService['findNearby']>[0]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('driver-near');
    });

    it('returns the driver active vehicle', async () => {
      prismaMock.driver.findMany.mockResolvedValue([
        {
          ...baseDriver,
          vehicles: [
            {
              id: 'inactive-vehicle',
              plateNumber: 'PMV-OLD',
              status: VehicleStatus.INACTIVE,
            },
            {
              id: 'active-vehicle',
              plateNumber: 'PMV-002',
              status: VehicleStatus.ACTIVE,
            },
          ],
        },
      ]);

      const result = await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
      } as Parameters<DriversService['findNearby']>[0]);

      expect(result[0].activeVehicle).toEqual(
        expect.objectContaining({
          id: 'active-vehicle',
          plateNumber: 'PMV-002',
          status: VehicleStatus.ACTIVE,
        }),
      );
    });

    it('ignores a driver without a location ping', async () => {
      prismaMock.driver.findMany.mockResolvedValue([
        {
          ...baseDriver,
          id: 'driver-without-location',
          locationPing: null,
        },
      ]);

      const result = await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
      } as Parameters<DriversService['findNearby']>[0]);

      expect(result).toEqual([]);
    });

    it('returns a driver with a fresh location ping', async () => {
      const now = Date.now();

      prismaMock.driver.findMany.mockResolvedValue([
        {
          ...baseDriver,
          locationPing: {
            ...baseDriver.locationPing,
            recordedAt: new Date(now - 30_000),
          },
        },
      ]);

      const result = await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
        maxLocationAgeSeconds: 120,
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('driver-1');
    });

    it('excludes a driver with a stale location ping', async () => {
      const now = Date.now();

      prismaMock.driver.findMany.mockResolvedValue([
        {
          ...baseDriver,
          locationPing: {
            ...baseDriver.locationPing,
            recordedAt: new Date(now - 180_000),
          },
        },
      ]);

      const result = await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
        maxLocationAgeSeconds: 120,
      });

      expect(result).toEqual([]);
    });

    it('passes the location freshness cutoff to Prisma', async () => {
      const now = Date.now();
      const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(now);

      prismaMock.driver.findMany.mockResolvedValue([]);

      await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
        maxLocationAgeSeconds: 300,
      });

      expect(prismaMock.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectObjectContaining({
            locationPing: {
              is: {
                recordedAt: {
                  gte: new Date(now - 300_000),
                },
              },
            },
          }),
        }),
      );

      dateNowSpy.mockRestore();
    });
    it('passes service-zone and location filters to Prisma', async () => {
      prismaMock.driver.findMany.mockResolvedValue([]);

      await service.findNearby({
        latitude: -9.4438,
        longitude: 147.1803,
        radiusKm: 5,
        locationId: '1',
        serviceZoneId: 'zone-1',
      } as Parameters<DriversService['findNearby']>[0]);

      expect(prismaMock.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expectObjectContaining({
            status: DriverStatus.APPROVED,
            isOnline: true,
            isAvailable: true,
            locationId: 1,
            serviceZoneId: 'zone-1',
          }),
        }),
      );
    });
  });

  describe('approval requirements', () => {
    it('rejects approval when the licence number is missing', async () => {
      prismaMock.driver.findUnique.mockResolvedValue({
        ...baseDriver,
        status: DriverStatus.PENDING,
        licenseNumber: null,
      });

      await expect(
        service.updateStatus('driver-1', DriverStatus.APPROVED),
      ).rejects.toThrow('Driver licence number is required before approval');

      expect(prismaMock.driver.update).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.vehicle.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('complete approval validation', () => {
    it('approves a driver with complete valid compliance details', async () => {
      const pendingDriver = {
        ...baseDriver,
        status: DriverStatus.PENDING,
        approvedAt: null,
      };

      const approvedDriver = {
        ...pendingDriver,
        status: DriverStatus.APPROVED,
        approvedAt: new Date(),
      };

      prismaMock.driver.findUnique.mockResolvedValue(pendingDriver);
      prismaMock.driver.update.mockResolvedValue(approvedDriver);

      const result = await service.updateStatus(
        'driver-1',
        DriverStatus.APPROVED,
      );

      expect(prismaMock.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          status: DriverStatus.APPROVED,
          isAvailable: true,
          approvedAt: expectAny(Date),
          suspensionReason: null,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });

      expect(result).toEqual(approvedDriver);
    });

    it('rejects approval when the driver licence has expired', async () => {
      prismaMock.driver.findUnique.mockResolvedValue({
        ...baseDriver,
        status: DriverStatus.PENDING,
        licenseExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
      });

      await expect(
        service.updateStatus('driver-1', DriverStatus.APPROVED),
      ).rejects.toThrow('Driver licence must be valid at the time of approval');

      expect(prismaMock.driver.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deactivates an existing driver instead of deleting it', async () => {
      const inactiveDriver = {
        ...baseDriver,
        status: DriverStatus.INACTIVE,
        isOnline: false,
        isAvailable: false,
      };

      prismaMock.driver.findUnique.mockResolvedValue(baseDriver);
      prismaMock.driver.update.mockResolvedValue(inactiveDriver);

      const result = await service.remove('driver-1');

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          driverId: 'driver-1',
          status: VehicleStatus.ACTIVE,
        },
        data: {
          status: VehicleStatus.INACTIVE,
        },
      });

      expect(prismaMock.driver.update).toHaveBeenCalledWith({
        where: { id: 'driver-1' },
        data: {
          status: DriverStatus.INACTIVE,
          isOnline: false,
          isAvailable: false,
        },
        omit: {
          passwordHash: true,
        },
        include: {
          location: true,
          serviceZone: true,
          locationPing: true,
          vehicles: true,
        },
      });

      expect(prismaMock.driver.delete).not.toHaveBeenCalled();
      expect(result).toEqual(inactiveDriver);
    });

    it('does not deactivate a missing driver', async () => {
      prismaMock.driver.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing-driver')).rejects.toThrow(
        'Driver not found',
      );

      expect(prismaMock.driver.update).not.toHaveBeenCalled();
      expect(prismaMock.driver.delete).not.toHaveBeenCalled();
    });
  });
});
