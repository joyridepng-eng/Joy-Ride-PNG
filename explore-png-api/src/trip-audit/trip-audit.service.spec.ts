import {
  RideAuditActorType,
  RideAuditEventType,
  RideStatus,
  RideType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripAuditPeriod } from './dto/trip-audit-query.dto';
import { TripAuditService } from './trip-audit.service';

describe('TripAuditService', () => {
  const prismaMock = {
    rideAuditEvent: {
      findMany: jest.fn(),
    },
  };

  let service: TripAuditService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new TripAuditService(prismaMock as unknown as PrismaService);
  });

  it('uses Port Moresby calendar-day boundaries', async () => {
    prismaMock.rideAuditEvent.findMany.mockResolvedValue([]);

    const result = await service.getReport({
      period: TripAuditPeriod.DAILY,
      anchor: '2026-09-04T02:00:00.000Z',
    });

    expect(result.range).toEqual({
      from: '2026-09-03T14:00:00.000Z',
      toExclusive: '2026-09-04T14:00:00.000Z',
    });
  });

  it('summarizes completed Driver trips and masks Rider phone numbers', async () => {
    const requestedAt = new Date('2026-09-03T23:00:00.000Z');

    const completedAt = new Date('2026-09-04T00:00:00.000Z');

    const ride = {
      id: 'ride-1',
      rideType: RideType.STANDARD,
      status: RideStatus.COMPLETED,
      requestedAt,
      riderName: 'Audit Rider',
      riderPhone: '+67570000001',
      pickupLabel: 'Waigani',
      pickupAddress: 'Waigani Drive',
      dropoffLabel: 'Boroko',
      dropoffAddress: 'Boroko',
      quotedDistanceMeters: 5432,
      quotedDurationSeconds: 900,
      farePolicyVersion: 'POM_CITY_DISTANCE_BANDS_2026_01',
      estimatedFare: 30,
      finalFare: 30,
      driver: {
        id: 'driver-1',
        fullName: 'Audit Driver',
        phone: '+67570000002',
      },
      vehicle: {
        id: 'vehicle-1',
        plateNumber: 'PMV-001',
        make: 'Toyota',
        model: 'Camry',
        color: 'White',
      },
      settlement: {
        receiptNumber: 'RCP-1',
        status: 'PENDING',
        finalFare: '30',
        driverShare: '24',
        companyShare: '6',
      },
    };

    prismaMock.rideAuditEvent.findMany.mockResolvedValue([
      {
        id: 'event-1',
        rideId: ride.id,
        eventType: RideAuditEventType.RIDE_REQUESTED,
        previousStatus: null,
        newStatus: RideStatus.REQUESTED,
        driverId: null,
        vehicleId: null,
        actorType: RideAuditActorType.RIDER,
        actorId: 'rider-1',
        notes: null,
        isApproximate: false,
        occurredAt: requestedAt,
        createdAt: requestedAt,
        ride,
      },
      {
        id: 'event-2',
        rideId: ride.id,
        eventType: RideAuditEventType.STATUS_CHANGED,
        previousStatus: RideStatus.IN_PROGRESS,
        newStatus: RideStatus.COMPLETED,
        driverId: 'driver-1',
        vehicleId: 'vehicle-1',
        actorType: RideAuditActorType.DRIVER,
        actorId: 'driver-1',
        notes: null,
        isApproximate: false,
        occurredAt: completedAt,
        createdAt: completedAt,
        ride,
      },
    ]);

    const result = await service.getReport({
      period: TripAuditPeriod.CUSTOM,
      from: '2026-09-03T14:00:00.000Z',
      to: '2026-09-04T14:00:00.000Z',
    });

    expect(result.summary).toEqual({
      totalTrips: 1,
      completedTrips: 1,
      cancelledTrips: 0,
      drivers: 1,
      grossFare: 30,
      driverShare: 24,
      companyShare: 6,
      knownDistanceKm: 5.43,
      tripsWithoutDistance: 0,
      approximateHistoricalTrips: 0,
    });

    expect(result.drivers[0]).toEqual(
      expect.objectContaining({
        driverId: 'driver-1',
        completed: 1,
        grossFare: 30,
        driverShare: 24,
        companyShare: 6,
        knownDistanceKm: 5.43,
      }),
    );

    expect(result.trips[0].rider.maskedPhone).toBe('********0001');
  });

  it('rejects an invalid custom range', async () => {
    await expect(
      service.getReport({
        period: TripAuditPeriod.CUSTOM,
        from: '2026-09-04T00:00:00.000Z',
        to: '2026-09-03T00:00:00.000Z',
      }),
    ).rejects.toThrow('The custom audit range is invalid');

    expect(prismaMock.rideAuditEvent.findMany).not.toHaveBeenCalled();
  });
});
