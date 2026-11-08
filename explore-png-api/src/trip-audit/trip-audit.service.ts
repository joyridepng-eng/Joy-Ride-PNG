import { BadRequestException, Injectable } from '@nestjs/common';
import { RideAuditEventType, RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripAuditPeriod, TripAuditQueryDto } from './dto/trip-audit-query.dto';

const PORT_MORESBY_OFFSET_MS = 10 * 60 * 60 * 1000;
const MAX_CUSTOM_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

type AuditRange = {
  from: Date;
  to: Date;
};

@Injectable()
export class TripAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(query: TripAuditQueryDto) {
    const range = this.resolveRange(query);

    const events = await this.prisma.rideAuditEvent.findMany({
      where: {
        occurredAt: {
          gte: range.from,
          lt: range.to,
        },
        ...(query.driverId
          ? {
              driverId: query.driverId,
            }
          : {}),
      },
      orderBy: [
        {
          occurredAt: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
      include: {
        ride: {
          include: {
            driver: {
              select: {
                id: true,
                fullName: true,
                phone: true,
              },
            },
            vehicle: {
              select: {
                id: true,
                plateNumber: true,
                make: true,
                model: true,
                color: true,
              },
            },
            settlement: true,
          },
        },
      },
    });

    type AuditEvent = (typeof events)[number];

    const eventsByRide = new Map<string, AuditEvent[]>();

    for (const event of events) {
      if (query.status && event.ride.status !== query.status) {
        continue;
      }

      const rideEvents = eventsByRide.get(event.rideId) ?? [];

      rideEvents.push(event);
      eventsByRide.set(event.rideId, rideEvents);
    }

    const trips = Array.from(eventsByRide.values()).map((rideEvents) => {
      const firstEvent = rideEvents[0];
      const ride = firstEvent.ride;

      const requestedEvent = rideEvents.find(
        (event) => event.eventType === RideAuditEventType.RIDE_REQUESTED,
      );

      const assignedEvent = rideEvents.find(
        (event) => event.eventType === RideAuditEventType.DRIVER_ASSIGNED,
      );

      const completedEvent = rideEvents.find(
        (event) => event.newStatus === RideStatus.COMPLETED,
      );

      const cancelledEvent = rideEvents.find(
        (event) => event.newStatus === RideStatus.CANCELLED,
      );

      const finalFare = Number(
        ride.settlement?.finalFare ?? ride.finalFare ?? ride.estimatedFare ?? 0,
      );

      return {
        rideId: ride.id,
        status: ride.status,
        rideType: ride.rideType,

        requestedAt:
          requestedEvent?.occurredAt.toISOString() ??
          ride.requestedAt.toISOString(),

        assignedAt: assignedEvent?.occurredAt.toISOString() ?? null,

        completedAt: completedEvent?.occurredAt.toISOString() ?? null,

        cancelledAt: cancelledEvent?.occurredAt.toISOString() ?? null,

        driver: ride.driver
          ? {
              id: ride.driver.id,
              fullName: ride.driver.fullName,
              phone: ride.driver.phone,
            }
          : null,

        vehicle: ride.vehicle,

        rider: {
          fullName: ride.riderName,
          maskedPhone: this.maskPhone(ride.riderPhone),
        },

        pickup: {
          label: ride.pickupLabel,
          address: ride.pickupAddress,
        },

        dropoff: {
          label: ride.dropoffLabel,
          address: ride.dropoffAddress,
        },

        quotedDistanceMeters: ride.quotedDistanceMeters,

        quotedDistanceKm:
          ride.quotedDistanceMeters === null
            ? null
            : this.round(ride.quotedDistanceMeters / 1000, 2),

        quotedDurationSeconds: ride.quotedDurationSeconds,

        farePolicyVersion: ride.farePolicyVersion,

        estimatedFare: ride.estimatedFare,

        finalFare,

        settlement: ride.settlement
          ? {
              receiptNumber: ride.settlement.receiptNumber,

              status: ride.settlement.status,

              driverShare: Number(ride.settlement.driverShare),

              companyShare: Number(ride.settlement.companyShare),
            }
          : null,

        containsApproximateHistory: rideEvents.some(
          (event) => event.isApproximate,
        ),

        events: rideEvents.map((event) => ({
          id: event.id,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          newStatus: event.newStatus,
          actorType: event.actorType,
          actorId: event.actorId,
          notes: event.notes,
          isApproximate: event.isApproximate,
          occurredAt: event.occurredAt.toISOString(),
        })),
      };
    });

    trips.sort((left, right) =>
      right.requestedAt.localeCompare(left.requestedAt),
    );

    const driverSummary = new Map<
      string,
      {
        driverId: string;
        driverName: string;
        driverPhone: string;
        vehiclePlate: string | null;
        trips: number;
        completed: number;
        cancelled: number;
        grossFare: number;
        driverShare: number;
        companyShare: number;
        knownDistanceMeters: number;
        tripsWithoutDistance: number;
      }
    >();

    for (const trip of trips) {
      if (!trip.driver) {
        continue;
      }

      const existing = driverSummary.get(trip.driver.id) ?? {
        driverId: trip.driver.id,
        driverName: trip.driver.fullName,
        driverPhone: trip.driver.phone,
        vehiclePlate: trip.vehicle?.plateNumber ?? null,
        trips: 0,
        completed: 0,
        cancelled: 0,
        grossFare: 0,
        driverShare: 0,
        companyShare: 0,
        knownDistanceMeters: 0,
        tripsWithoutDistance: 0,
      };

      existing.trips += 1;

      if (trip.completedAt) {
        existing.completed += 1;
        existing.grossFare += trip.finalFare;
        existing.driverShare += trip.settlement?.driverShare ?? 0;
        existing.companyShare += trip.settlement?.companyShare ?? 0;
      }

      if (trip.cancelledAt) {
        existing.cancelled += 1;
      }

      if (trip.quotedDistanceMeters === null) {
        existing.tripsWithoutDistance += 1;
      } else {
        existing.knownDistanceMeters += trip.quotedDistanceMeters;
      }

      driverSummary.set(trip.driver.id, existing);
    }

    const drivers = Array.from(driverSummary.values())
      .map((driver) => ({
        ...driver,
        completionRate:
          driver.trips === 0
            ? 0
            : this.round((driver.completed / driver.trips) * 100, 1),
        grossFare: this.round(driver.grossFare, 2),
        driverShare: this.round(driver.driverShare, 2),
        companyShare: this.round(driver.companyShare, 2),
        knownDistanceKm: this.round(driver.knownDistanceMeters / 1000, 2),
      }))
      .sort((left, right) => left.driverName.localeCompare(right.driverName));

    const completedTrips = trips.filter((trip) => trip.completedAt !== null);

    const cancelledTrips = trips.filter((trip) => trip.cancelledAt !== null);

    return {
      period: query.period,
      timezone: 'Pacific/Port_Moresby',

      range: {
        from: range.from.toISOString(),
        toExclusive: range.to.toISOString(),
      },

      generatedAt: new Date().toISOString(),

      summary: {
        totalTrips: trips.length,
        completedTrips: completedTrips.length,
        cancelledTrips: cancelledTrips.length,
        drivers: drivers.length,

        grossFare: this.round(
          completedTrips.reduce((total, trip) => total + trip.finalFare, 0),
          2,
        ),

        driverShare: this.round(
          completedTrips.reduce(
            (total, trip) => total + (trip.settlement?.driverShare ?? 0),
            0,
          ),
          2,
        ),

        companyShare: this.round(
          completedTrips.reduce(
            (total, trip) => total + (trip.settlement?.companyShare ?? 0),
            0,
          ),
          2,
        ),

        knownDistanceKm: this.round(
          trips.reduce(
            (total, trip) => total + (trip.quotedDistanceMeters ?? 0),
            0,
          ) / 1000,
          2,
        ),

        tripsWithoutDistance: trips.filter(
          (trip) => trip.quotedDistanceMeters === null,
        ).length,

        approximateHistoricalTrips: trips.filter(
          (trip) => trip.containsApproximateHistory,
        ).length,
      },

      drivers,
      trips,
    };
  }

  private resolveRange(query: TripAuditQueryDto): AuditRange {
    if (query.period === TripAuditPeriod.CUSTOM) {
      if (!query.from || !query.to) {
        throw new BadRequestException(
          'Custom reports require both from and to timestamps',
        );
      }

      const from = new Date(query.from);
      const to = new Date(query.to);

      this.assertValidRange(from, to);

      return {
        from,
        to,
      };
    }

    const anchor = query.anchor ? new Date(query.anchor) : new Date();

    if (Number.isNaN(anchor.getTime())) {
      throw new BadRequestException('The report anchor is invalid');
    }

    const localAnchor = new Date(anchor.getTime() + PORT_MORESBY_OFFSET_MS);

    const year = localAnchor.getUTCFullYear();

    const month = localAnchor.getUTCMonth();

    const day = localAnchor.getUTCDate();

    let localStartMs: number;
    let localEndMs: number;

    switch (query.period) {
      case TripAuditPeriod.WEEKLY: {
        const mondayOffset = (localAnchor.getUTCDay() + 6) % 7;

        localStartMs = Date.UTC(year, month, day - mondayOffset);

        localEndMs = localStartMs + 7 * 24 * 60 * 60 * 1000;

        break;
      }

      case TripAuditPeriod.MONTHLY:
        localStartMs = Date.UTC(year, month, 1);

        localEndMs = Date.UTC(year, month + 1, 1);

        break;

      case TripAuditPeriod.DAILY:
      default:
        localStartMs = Date.UTC(year, month, day);

        localEndMs = localStartMs + 24 * 60 * 60 * 1000;
    }

    return {
      from: new Date(localStartMs - PORT_MORESBY_OFFSET_MS),

      to: new Date(localEndMs - PORT_MORESBY_OFFSET_MS),
    };
  }

  private assertValidRange(from: Date, to: Date): void {
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    ) {
      throw new BadRequestException('The custom audit range is invalid');
    }

    if (to.getTime() - from.getTime() > MAX_CUSTOM_RANGE_MS) {
      throw new BadRequestException(
        'Custom audit reports cannot exceed 366 days',
      );
    }
  }

  private maskPhone(phone: string | null): string | null {
    if (!phone) {
      return null;
    }

    if (phone.length <= 4) {
      return '*'.repeat(phone.length);
    }

    return '*'.repeat(phone.length - 4) + phone.slice(-4);
  }

  private round(value: number, decimalPlaces: number): number {
    const multiplier = 10 ** decimalPlaces;

    return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
  }
}
