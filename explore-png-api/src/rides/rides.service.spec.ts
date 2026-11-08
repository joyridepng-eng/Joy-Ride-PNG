import { BadRequestException } from '@nestjs/common';
import {
  DriverStatus,
  RideAuditActorType,
  RideAuditEventType,
  RideSettlementStatus,
  RideType,
  RideStatus,
  VehicleStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from '../routing/routing.service';
import { RidesService } from './rides.service';

describe('RidesService', () => {
  let service: RidesService;

  const prismaMock = {
    ride: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    driver: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rideSettlement: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    rideAuditEvent: {
      create: jest.fn(),
    },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const routingMock = {
    getDrivingRoute: jest.fn(),
  };

  const notificationsMock = {
    createAdminRideRequestedItems: jest.fn(),
    createDriverRideAssignedItem: jest.fn(),
  };

  const requestedRide = {
    id: 'ride-1',
    status: RideStatus.REQUESTED,
    riderName: 'Test Rider',
    riderPhone: '+67570000001',
    estimatedFare: 100,
    finalFare: null,
    driverId: null,
    vehicleId: null,
    serviceZoneId: 'zone-1',
    settlement: null,
  };

  const assignedRide = {
    ...requestedRide,
    status: RideStatus.ACCEPTED,
    driverId: 'driver-1',
    vehicleId: 'vehicle-1',
  };

  const approvedDriver = {
    id: 'driver-1',
    fullName: 'Test Driver',
    status: DriverStatus.APPROVED,
    isOnline: true,
    isAvailable: true,
    serviceZoneId: 'zone-1',
    vehicles: [
      {
        id: 'vehicle-1',
        status: VehicleStatus.ACTIVE,
        plateNumber: 'PMV-001',
      },
    ],
  };

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock the lock operation; this is not a PostgreSQL concurrency test.
    prismaMock.$executeRaw.mockResolvedValue(0);
    prismaMock.ride.findFirst.mockResolvedValue(null);
    prismaMock.ride.updateMany.mockResolvedValue({ count: 1 });

    routingMock.getDrivingRoute.mockResolvedValue({
      distanceMeters: 5432.4,
      durationSeconds: 900,
      coordinates: [
        [147.1803, -9.4438],
        [147.2204, -9.4538],
      ],
    });

    service = new RidesService(
      prismaMock as unknown as PrismaService,
      routingMock as unknown as RoutingService,
      notificationsMock as unknown as NotificationsService,
    );

    prismaMock.$transaction.mockImplementation(
      (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock),
    );
  });

  describe('fare quote', () => {
    it('returns a routed fare without creating a ride', async () => {
      const result = await service.quote({
        rideType: RideType.STANDARD,
        pickupLabel: 'Ela Beach',
        pickupLatitude: -9.4438,
        pickupLongitude: 147.1803,
        dropoffLabel: 'Waigani',
        dropoffLatitude: -9.4538,
        dropoffLongitude: 147.2204,
        estimatedFare: 999,
      });

      expect(result).toEqual({
        policyVersion: 'POM_CITY_FIXED_WHOLE_KM_BANDS_2026_02',
        distanceMeters: 5432,
        distanceKm: 5.43,
        durationSeconds: 900,
        bandFare: 20,
        legalMaximumFare: 36.55,
        fare: 20,
        legalCapApplied: false,
      });

      expect(routingMock.getDrivingRoute).toHaveBeenCalledWith(
        -9.4438,
        147.1803,
        -9.4538,
        147.2204,
      );

      expect(prismaMock.ride.create).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentLocation', () => {
    const recordedAt = new Date();

    it('returns the assigned driver current location', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
        driver: {
          locationPing: {
            id: 'location-1',
            driverId: 'driver-1',
            latitude: -9.4438,
            longitude: 147.2204,
            accuracy: 8,
            heading: 90,
            speed: 35,
            recordedAt,
            updatedAt: recordedAt,
          },
        },
      });

      const result = await service.getCurrentLocation('ride-1');

      expect(prismaMock.ride.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'ride-1',
        },
        select: {
          id: true,
          driverId: true,
          driver: {
            select: {
              locationPing: true,
            },
          },
        },
      });

      expect(result).toEqual({
        rideId: 'ride-1',
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.2204,
        accuracy: 8,
        heading: 90,
        speed: 35,
        recordedAt,
        isFresh: true,
      });
    });

    it('marks an old driver location as stale', async () => {
      const staleRecordedAt = new Date(Date.now() - 3 * 60 * 1000);

      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
        driver: {
          locationPing: {
            id: 'location-1',
            driverId: 'driver-1',
            latitude: -9.4438,
            longitude: 147.2204,
            accuracy: null,
            heading: null,
            speed: null,
            recordedAt: staleRecordedAt,
            updatedAt: staleRecordedAt,
          },
        },
      });

      const result = await service.getCurrentLocation('ride-1');

      expect(result.isFresh).toBe(false);
    });

    it('throws when the ride does not exist', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentLocation('ride-missing')).rejects.toThrow(
        'Ride not found',
      );
    });

    it('throws when the ride has no assigned driver', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: null,
        driver: null,
      });

      await expect(service.getCurrentLocation('ride-1')).rejects.toThrow(
        'Ride has no assigned driver',
      );
    });

    it('throws when the assigned driver has no location', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        driverId: 'driver-1',
        driver: {
          locationPing: null,
        },
      });

      await expect(service.getCurrentLocation('ride-1')).rejects.toThrow(
        'Driver location not found',
      );
    });
  });
  describe('assignDriver', () => {
    beforeEach(() => {
      prismaMock.ride.findUnique
        .mockResolvedValueOnce(requestedRide)
        .mockResolvedValueOnce(assignedRide);

      prismaMock.driver.findUnique.mockResolvedValue(approvedDriver);

      prismaMock.driver.updateMany.mockResolvedValue({
        count: 1,
      });

      prismaMock.ride.updateMany.mockResolvedValue({
        count: 1,
      });
    });

    it('atomically assigns an approved, online, available driver with an active vehicle', async () => {
      const result = await service.assignDriver('ride-1', {
        driverId: 'driver-1',
      });

      expect(
        notificationsMock.createDriverRideAssignedItem,
      ).toHaveBeenCalledWith(prismaMock, 'ride-1', 'driver-1');

      expect(prismaMock.driver.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
          status: 'APPROVED',
          isOnline: true,
          isAvailable: true,
        },
        data: {
          isAvailable: false,
        },
      });

      expect(prismaMock.ride.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ride-1',
          status: RideStatus.REQUESTED,
          driverId: null,
          vehicleId: null,
        },
        data: {
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          status: RideStatus.ACCEPTED,
        },
      });

      expect(prismaMock.rideAuditEvent.create).toHaveBeenCalledWith({
        data: {
          rideId: 'ride-1',
          eventType: RideAuditEventType.DRIVER_ASSIGNED,
          previousStatus: RideStatus.REQUESTED,
          newStatus: RideStatus.ACCEPTED,
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          actorType: RideAuditActorType.ADMIN,
        },
      });
      expect(prismaMock.ride.findUnique).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            id: 'ride-1',
          },
        }),
      );

      expect(result.status).toBe(RideStatus.ACCEPTED);
      expect(result.driverId).toBe('driver-1');
      expect(result.vehicleId).toBe('vehicle-1');
    });

    it('rejects assignment when another request claims the driver first', async () => {
      prismaMock.driver.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow(
        'Driver is no longer available and may have been assigned to another ride',
      );

      expect(prismaMock.ride.updateMany).not.toHaveBeenCalled();

      expect(prismaMock.ride.findUnique).toHaveBeenCalledTimes(1);
    });

    it('rejects assignment when another request claims the ride first', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce(requestedRide);

      prismaMock.driver.updateMany.mockResolvedValue({
        count: 1,
      });

      prismaMock.ride.updateMany.mockResolvedValue({
        count: 0,
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow('Ride is no longer available for driver assignment');

      expect(prismaMock.driver.updateMany).toHaveBeenCalledTimes(1);

      expect(prismaMock.ride.updateMany).toHaveBeenCalledTimes(1);

      expect(prismaMock.ride.findUnique).toHaveBeenCalledTimes(1);
    });

    it('rejects an unavailable driver', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce(requestedRide);

      prismaMock.driver.findUnique.mockResolvedValue({
        ...approvedDriver,
        isAvailable: false,
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow('Driver is not available');

      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an offline driver', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce(requestedRide);

      prismaMock.driver.findUnique.mockResolvedValue({
        ...approvedDriver,
        isOnline: false,
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow('Driver is not online');

      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an unapproved driver', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce(requestedRide);

      prismaMock.driver.findUnique.mockResolvedValue({
        ...approvedDriver,
        status: DriverStatus.PENDING,
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow('Driver is not approved');

      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a driver without an active vehicle', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce(requestedRide);

      prismaMock.driver.findUnique.mockResolvedValue({
        ...approvedDriver,
        vehicles: [],
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow('Selected driver has no active vehicle');

      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a driver assigned to another service zone', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce(requestedRide);

      prismaMock.driver.findUnique.mockResolvedValue({
        ...approvedDriver,
        serviceZoneId: 'zone-2',
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow('Driver is not assigned to the ride service zone');

      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
    });

    it('rejects assignment unless the ride is requested', async () => {
      prismaMock.ride.findUnique.mockReset();
      prismaMock.ride.findUnique.mockResolvedValueOnce({
        ...requestedRide,
        status: RideStatus.ACCEPTED,
      });

      await expect(
        service.assignDriver('ride-1', {
          driverId: 'driver-1',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.driver.findUnique).not.toHaveBeenCalled();

      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    const inProgressRide = {
      ...requestedRide,
      status: RideStatus.IN_PROGRESS,
      driverId: 'driver-1',
      vehicleId: 'vehicle-1',
      estimatedFare: 100,
    };

    it('completes a ride, creates an 80/20 settlement and releases the driver', async () => {
      prismaMock.ride.findUnique
        .mockResolvedValueOnce(inProgressRide)
        .mockResolvedValueOnce(inProgressRide)
        .mockResolvedValueOnce({
          ...inProgressRide,
          status: RideStatus.COMPLETED,
          finalFare: 100,
        });

      prismaMock.ride.update.mockResolvedValue({
        ...inProgressRide,
        status: RideStatus.COMPLETED,
      });

      prismaMock.rideSettlement.upsert.mockResolvedValue({
        rideId: 'ride-1',
      });

      prismaMock.driver.updateMany.mockResolvedValue({
        count: 1,
      });

      const result = await service.updateStatus('ride-1', {
        status: RideStatus.COMPLETED,
      });

      expect(prismaMock.rideSettlement.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            rideId: 'ride-1',
          },
          // Jest asymmetric matchers are intentionally dynamic in this mock.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          create: expect.objectContaining({
            rideId: 'ride-1',
            driverId: 'driver-1',
            vehicleId: 'vehicle-1',
            status: RideSettlementStatus.PENDING,
          }),
        }),
      );

      /*
       * The Jest mock call registry is dynamically typed. It is cast
       * immediately to the settlement shape used by this assertion.
       */
      /* eslint-disable @typescript-eslint/no-unsafe-member-access */
      const settlementCall = prismaMock.rideSettlement.upsert.mock
        .calls[0]?.[0] as unknown as {
        create: {
          finalFare: {
            toString: () => string;
          };
          driverShare: {
            toString: () => string;
          };
          companyShare: {
            toString: () => string;
          };
        };
      };
      /* eslint-enable @typescript-eslint/no-unsafe-member-access */

      expect(settlementCall.create.finalFare.toString()).toBe('100');

      expect(settlementCall.create.driverShare.toString()).toBe('80');

      expect(settlementCall.create.companyShare.toString()).toBe('20');

      expect(prismaMock.rideAuditEvent.create).toHaveBeenNthCalledWith(1, {
        data: {
          rideId: 'ride-1',
          eventType: RideAuditEventType.STATUS_CHANGED,
          previousStatus: RideStatus.IN_PROGRESS,
          newStatus: RideStatus.COMPLETED,
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          actorType: RideAuditActorType.ADMIN,
          actorId: undefined,
          notes: undefined,
        },
      });

      expect(prismaMock.rideAuditEvent.create).toHaveBeenNthCalledWith(2, {
        data: {
          rideId: 'ride-1',
          eventType: RideAuditEventType.SETTLEMENT_CREATED,
          driverId: 'driver-1',
          vehicleId: 'vehicle-1',
          actorType: RideAuditActorType.ADMIN,
          actorId: undefined,
          metadata: {
            finalFare: '100',
            settlementStatus: RideSettlementStatus.PENDING,
          },
        },
      });
      expect(prismaMock.driver.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
          status: DriverStatus.APPROVED,
          isOnline: true,
          vehicles: {
            some: {
              status: VehicleStatus.ACTIVE,
            },
          },
        },
        data: {
          isAvailable: true,
        },
      });

      expect(prismaMock.driver.update).not.toHaveBeenCalled();

      expect(result?.status).toBe(RideStatus.COMPLETED);
    });

    it('completes the ride without making an ineligible driver available', async () => {
      prismaMock.ride.findUnique
        .mockResolvedValueOnce(inProgressRide)
        .mockResolvedValueOnce(inProgressRide)
        .mockResolvedValueOnce({
          ...inProgressRide,
          status: RideStatus.COMPLETED,
          finalFare: 100,
        });

      prismaMock.ride.update.mockResolvedValue({
        ...inProgressRide,
        status: RideStatus.COMPLETED,
      });

      prismaMock.rideSettlement.upsert.mockResolvedValue({
        rideId: 'ride-1',
      });

      prismaMock.driver.updateMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.updateStatus('ride-1', {
        status: RideStatus.COMPLETED,
      });

      expect(prismaMock.driver.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'driver-1',
          status: DriverStatus.APPROVED,
          isOnline: true,
          vehicles: {
            some: {
              status: VehicleStatus.ACTIVE,
            },
          },
        },
        data: {
          isAvailable: true,
        },
      });

      expect(prismaMock.driver.update).not.toHaveBeenCalled();

      expect(result?.status).toBe(RideStatus.COMPLETED);
    });
    it('rejects completion without a positive fare', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        ...inProgressRide,
        estimatedFare: null,
        finalFare: null,
      });

      await expect(
        service.updateStatus('ride-1', {
          status: RideStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        'Cannot complete ride without a valid finalFare or estimatedFare',
      );

      expect(prismaMock.rideSettlement.upsert).not.toHaveBeenCalled();

      expect(prismaMock.driver.update).not.toHaveBeenCalled();
    });
  });

  describe('markSettlementPaid', () => {
    it('marks a pending settlement as paid', async () => {
      prismaMock.ride.findUnique
        .mockResolvedValueOnce({
          ...requestedRide,
          status: RideStatus.COMPLETED,
          settlement: {
            status: RideSettlementStatus.PENDING,
          },
        })
        .mockResolvedValueOnce({
          ...requestedRide,
          status: RideStatus.COMPLETED,
          settlement: {
            status: RideSettlementStatus.PAID,
          },
        });

      prismaMock.rideSettlement.update.mockResolvedValue({
        status: RideSettlementStatus.PAID,
      });

      const result = await service.markSettlementPaid('ride-1');

      expect(prismaMock.rideSettlement.update).toHaveBeenCalledWith({
        where: {
          rideId: 'ride-1',
        },
        data: {
          status: RideSettlementStatus.PAID,
        },
      });

      expect(prismaMock.rideAuditEvent.create).toHaveBeenCalledWith({
        data: {
          rideId: 'ride-1',
          eventType: RideAuditEventType.SETTLEMENT_PAID,
          driverId: null,
          vehicleId: null,
          actorType: RideAuditActorType.ADMIN,
          metadata: {
            previousSettlementStatus: RideSettlementStatus.PENDING,
            newSettlementStatus: RideSettlementStatus.PAID,
          },
        },
      });
      expect(result.settlement).not.toBeNull();
      expect(result.settlement?.status).toBe(RideSettlementStatus.PAID);
    });

    it('rejects payment when no settlement exists', async () => {
      prismaMock.ride.findUnique.mockResolvedValueOnce({
        ...requestedRide,
        settlement: null,
      });

      await expect(service.markSettlementPaid('ride-1')).rejects.toThrow(
        'Ride settlement not found',
      );

      expect(prismaMock.rideSettlement.update).not.toHaveBeenCalled();
    });

    it('rejects a settlement that is no longer pending', async () => {
      prismaMock.ride.findUnique.mockResolvedValueOnce({
        ...requestedRide,
        settlement: {
          status: RideSettlementStatus.PAID,
        },
      });

      await expect(service.markSettlementPaid('ride-1')).rejects.toThrow(
        'Only PENDING settlements can be marked as PAID',
      );

      expect(prismaMock.rideSettlement.update).not.toHaveBeenCalled();
    });
  });

  describe('authenticated ownership', () => {
    const authenticatedRider = {
      id: 'rider-1',
      fullName: 'Authenticated Rider',
      phone: '+67570000001',
    };

    it('binds a new ride to the authenticated Rider identity', async () => {
      prismaMock.ride.create.mockResolvedValue({
        ...requestedRide,
        riderId: authenticatedRider.id,
        riderName: authenticatedRider.fullName,
        riderPhone: authenticatedRider.phone,
      });

      await service.create(
        {
          rideType: RideType.STANDARD,
          pickupLabel: 'Ela Beach',
          pickupLatitude: -9.4438,
          pickupLongitude: 147.1803,
          dropoffLabel: 'Waigani',
          dropoffLatitude: -9.4538,
          dropoffLongitude: 147.2204,
          estimatedFare: 999,
        },
        authenticatedRider,
      );

      expect(prismaMock.ride.create).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(
        notificationsMock.createAdminRideRequestedItems,
      ).toHaveBeenCalledWith(prismaMock, 'ride-1');

      const createCalls = prismaMock.ride.create.mock.calls as unknown[][];

      const createArgument = createCalls[0]?.[0] as {
        data: Record<string, unknown>;
      };

      expect(createArgument.data.riderId).toBe(authenticatedRider.id);
      expect(createArgument.data.riderName).toBe(authenticatedRider.fullName);
      expect(createArgument.data.riderPhone).toBe(authenticatedRider.phone);

      const requestAudit = createArgument.data.auditEvents as {
        create: {
          eventType: RideAuditEventType;
          newStatus: RideStatus;
          actorType: RideAuditActorType;
          actorId: string;
        };
      };

      expect(requestAudit.create).toEqual({
        eventType: RideAuditEventType.RIDE_REQUESTED,
        newStatus: RideStatus.REQUESTED,
        actorType: RideAuditActorType.RIDER,
        actorId: authenticatedRider.id,
      });
      expect(createArgument.data.estimatedFare).toBe(20);
      expect(routingMock.getDrivingRoute).toHaveBeenCalledWith(
        -9.4438,
        147.1803,
        -9.4538,
        147.2204,
      );
      expect(createArgument.data).not.toHaveProperty('driverId');
      expect(createArgument.data).not.toHaveProperty('vehicleId');
      expect(createArgument.data).not.toHaveProperty('finalFare');
    });

    it('returns a ride only when it belongs to the Rider', async () => {
      prismaMock.ride.findFirst.mockResolvedValue({
        ...requestedRide,
        riderId: authenticatedRider.id,
      });

      const result = await service.findRiderRide(
        'ride-1',
        authenticatedRider.id,
      );

      expect(prismaMock.ride.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'ride-1',
            riderId: authenticatedRider.id,
          },
        }),
      );

      expect(result.id).toBe('ride-1');
    });

    it('does not reveal a ride owned by another Rider', async () => {
      prismaMock.ride.findFirst.mockResolvedValue(null);

      await expect(service.findRiderRide('ride-1', 'rider-2')).rejects.toThrow(
        'Ride not found',
      );
    });

    it('does not allow a Driver to update another Driver ride', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        ...assignedRide,
        driverId: 'driver-1',
      });

      await expect(
        service.updateDriverRideStatus('ride-1', 'driver-2', {
          status: RideStatus.DRIVER_ARRIVED,
        }),
      ).rejects.toThrow('Assigned ride not found');

      // Ownership is checked after acquiring the transaction lock.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);

      // Rejection must occur before any business records are changed.
      expect(prismaMock.ride.update).not.toHaveBeenCalled();
      expect(prismaMock.ride.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.driver.update).not.toHaveBeenCalled();
      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.rideSettlement.upsert).not.toHaveBeenCalled();
      expect(prismaMock.rideSettlement.update).not.toHaveBeenCalled();
      expect(prismaMock.rideAuditEvent.create).not.toHaveBeenCalled();
    });

    it('omits Driver password hashes from expanded ride responses', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(requestedRide);

      await service.findOne('ride-1');

      expect(prismaMock.ride.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'ride-1',
        },
        include: {
          location: true,
          serviceZone: true,
          driver: {
            omit: {
              passwordHash: true,
            },
            include: {
              locationPing: true,
              vehicles: true,
            },
          },
          vehicle: true,
          settlement: true,
        },
      });
    });
  });

  describe('authenticated ownership', () => {
    const authenticatedRider = {
      id: 'rider-1',
      fullName: 'Authenticated Rider',
      phone: '+67570000001',
    };

    it('binds a new ride to the authenticated Rider identity', async () => {
      prismaMock.ride.create.mockResolvedValue({
        ...requestedRide,
        riderId: authenticatedRider.id,
        riderName: authenticatedRider.fullName,
        riderPhone: authenticatedRider.phone,
      });

      await service.create(
        {
          rideType: RideType.STANDARD,
          pickupLabel: 'Ela Beach',
          pickupLatitude: -9.4438,
          pickupLongitude: 147.1803,
          dropoffLabel: 'Waigani',
          dropoffLatitude: -9.4538,
          dropoffLongitude: 147.2204,
          estimatedFare: 999,
        },
        authenticatedRider,
      );

      expect(prismaMock.ride.create).toHaveBeenCalledTimes(1);

      const createCalls = prismaMock.ride.create.mock.calls as unknown[][];

      const createArgument = createCalls[0]?.[0] as {
        data: Record<string, unknown>;
      };

      expect(createArgument.data.riderId).toBe(authenticatedRider.id);
      expect(createArgument.data.riderName).toBe(authenticatedRider.fullName);
      expect(createArgument.data.riderPhone).toBe(authenticatedRider.phone);
      expect(createArgument.data.estimatedFare).toBe(20);
      expect(routingMock.getDrivingRoute).toHaveBeenCalledWith(
        -9.4438,
        147.1803,
        -9.4538,
        147.2204,
      );
      expect(createArgument.data).not.toHaveProperty('driverId');
      expect(createArgument.data).not.toHaveProperty('vehicleId');
      expect(createArgument.data).not.toHaveProperty('finalFare');
    });

    it('returns a ride only when it belongs to the Rider', async () => {
      prismaMock.ride.findFirst.mockResolvedValue({
        ...requestedRide,
        riderId: authenticatedRider.id,
      });

      const result = await service.findRiderRide(
        'ride-1',
        authenticatedRider.id,
      );

      expect(prismaMock.ride.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'ride-1',
            riderId: authenticatedRider.id,
          },
        }),
      );

      expect(result.id).toBe('ride-1');
    });

    it('does not reveal a ride owned by another Rider', async () => {
      prismaMock.ride.findFirst.mockResolvedValue(null);

      await expect(service.findRiderRide('ride-1', 'rider-2')).rejects.toThrow(
        'Ride not found',
      );
    });

    it('does not allow a Driver to update another Driver ride', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        ...assignedRide,
        driverId: 'driver-1',
      });

      await expect(
        service.updateDriverRideStatus('ride-1', 'driver-2', {
          status: RideStatus.DRIVER_ARRIVED,
        }),
      ).rejects.toThrow('Assigned ride not found');

      // Ownership is checked after acquiring the transaction lock.
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);

      // Rejection must occur before any business records are changed.
      expect(prismaMock.ride.update).not.toHaveBeenCalled();
      expect(prismaMock.ride.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.driver.update).not.toHaveBeenCalled();
      expect(prismaMock.driver.updateMany).not.toHaveBeenCalled();
      expect(prismaMock.rideSettlement.upsert).not.toHaveBeenCalled();
      expect(prismaMock.rideSettlement.update).not.toHaveBeenCalled();
      expect(prismaMock.rideAuditEvent.create).not.toHaveBeenCalled();
    });

    it('omits Driver password hashes from expanded ride responses', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(requestedRide);

      await service.findOne('ride-1');

      expect(prismaMock.ride.findUnique).toHaveBeenCalledWith({
        where: {
          id: 'ride-1',
        },
        include: {
          location: true,
          serviceZone: true,
          driver: {
            omit: {
              passwordHash: true,
            },
            include: {
              locationPing: true,
              vehicles: true,
            },
          },
          vehicle: true,
          settlement: true,
        },
      });
    });
  });
});
