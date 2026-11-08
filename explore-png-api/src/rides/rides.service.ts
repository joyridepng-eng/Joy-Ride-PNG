import {
  lockDriverAssignment,
  hasActiveDriverRide,
  DRIVER_TRANSACTION_OPTIONS,
} from '../common/driver-assignment-lock';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RideAuditActorType,
  RideAuditEventType,
  RideSettlementStatus,
  RideStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoutingService } from '../routing/routing.service';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideStatusDto } from './dto/update-ride-status.dto';
import { calculateJoyRideFare } from './fare-policy';
import { assertRideStatusTransition } from './ride-status.transitions';

@Injectable()
export class RidesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(
    dto: CreateRideDto,
    rider: {
      id: string;
      fullName: string;
      phone: string;
    },
  ) {
    const fareQuote = await this.calculateFareQuote(dto);

    return this.prisma.$transaction(async (tx) => {
      const ride = await tx.ride.create({
        data: {
          rideType: dto.rideType,
          riderId: rider.id,
          riderName: rider.fullName,
          riderPhone: rider.phone,

          locationId:
            dto.locationId === undefined ? undefined : Number(dto.locationId),
          serviceZoneId: dto.serviceZoneId,

          pickupLabel: dto.pickupLabel,
          pickupAddress: dto.pickupAddress,
          pickupLatitude: dto.pickupLatitude,
          pickupLongitude: dto.pickupLongitude,

          dropoffLabel: dto.dropoffLabel,
          dropoffAddress: dto.dropoffAddress,
          dropoffLatitude: dto.dropoffLatitude,
          dropoffLongitude: dto.dropoffLongitude,

          scheduledAt: dto.scheduledAt,
          estimatedFare: fareQuote.fare,
          quotedDistanceMeters: fareQuote.distanceMeters,
          quotedDurationSeconds: fareQuote.durationSeconds,
          farePolicyVersion: fareQuote.policyVersion,
          notes: dto.notes,

          auditEvents: {
            create: {
              eventType: RideAuditEventType.RIDE_REQUESTED,
              newStatus: RideStatus.REQUESTED,
              actorType: RideAuditActorType.RIDER,
              actorId: rider.id,
            },
          },
        },
        include: this.defaultInclude(),
      });

      await this.notificationsService.createAdminRideRequestedItems(
        tx,
        ride.id,
      );

      return ride;
    });
  }

  quote(dto: CreateRideDto) {
    return this.calculateFareQuote(dto);
  }

  private async calculateFareQuote(dto: CreateRideDto) {
    const coordinates = [
      dto.pickupLatitude,
      dto.pickupLongitude,
      dto.dropoffLatitude,
      dto.dropoffLongitude,
    ];

    if (
      coordinates.some(
        (coordinate) =>
          coordinate === undefined || !Number.isFinite(coordinate),
      )
    ) {
      throw new BadRequestException(
        'Valid pickup and drop-off coordinates are required to calculate the fare',
      );
    }

    const route = await this.routingService.getDrivingRoute(
      dto.pickupLatitude as number,
      dto.pickupLongitude as number,
      dto.dropoffLatitude as number,
      dto.dropoffLongitude as number,
    );

    return {
      ...calculateJoyRideFare(route.distanceMeters),
      durationSeconds: Math.round(route.durationSeconds),
    };
  }

  findAll(query?: {
    status?: string;
    locationId?: string;
    serviceZoneId?: string;
    driverId?: string;
  }) {
    return this.prisma.ride.findMany({
      where: {
        ...(query?.status ? { status: query.status as RideStatus } : {}),
        ...(query?.locationId ? { locationId: Number(query.locationId) } : {}),
        ...(query?.serviceZoneId ? { serviceZoneId: query.serviceZoneId } : {}),
        ...(query?.driverId ? { driverId: query.driverId } : {}),
      },
      orderBy: {
        requestedAt: 'desc',
      },
      include: this.defaultInclude(),
    });
  }

  async findActiveDriverRide(driverId: string) {
    return this.prisma.ride.findFirst({
      where: {
        driverId,
        status: {
          in: [
            RideStatus.ACCEPTED,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.IN_PROGRESS,
          ],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        status: true,
        riderName: true,
        riderPhone: true,
        pickupLabel: true,
        pickupAddress: true,
        pickupLatitude: true,
        pickupLongitude: true,
        dropoffLabel: true,
        dropoffAddress: true,
        dropoffLatitude: true,
        dropoffLongitude: true,
        estimatedFare: true,
        finalFare: true,
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
      },
    });
  }

  async findActiveRiderRide(riderId: string) {
    return this.prisma.ride.findFirst({
      where: {
        riderId,
        status: {
          in: [
            RideStatus.REQUESTED,
            RideStatus.ACCEPTED,
            RideStatus.DRIVER_ARRIVED,
            RideStatus.IN_PROGRESS,
          ],
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: this.defaultInclude(),
    });
  }

  async findRiderRide(id: string, riderId: string) {
    const ride = await this.prisma.ride.findFirst({
      where: {
        id,
        riderId,
      },
      include: this.defaultInclude(),
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    return ride;
  }

  async getRiderCurrentLocation(id: string, riderId: string) {
    await this.assertRiderOwnsRide(id, riderId);
    return this.getCurrentLocation(id);
  }

  async getRiderSettlement(id: string, riderId: string) {
    await this.assertRiderOwnsRide(id, riderId);
    return this.getSettlement(id);
  }

  async updateDriverRideStatus(
    id: string,
    driverId: string,
    dto: UpdateRideStatusDto,
  ) {
    return this.updateStatus(id, dto, driverId);
  }

  async findOne(id: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id },
      include: this.defaultInclude(),
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    return ride;
  }

  async getCurrentLocation(id: string) {
    const ride = await this.prisma.ride.findUnique({
      where: {
        id,
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

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (!ride.driverId) {
      throw new NotFoundException('Ride has no assigned driver');
    }

    const location = ride.driver?.locationPing;

    if (!location) {
      throw new NotFoundException('Driver location not found');
    }

    const freshnessThresholdMs = 2 * 60 * 1000;
    const isFresh =
      Date.now() - location.recordedAt.getTime() <= freshnessThresholdMs;

    return {
      rideId: ride.id,
      driverId: ride.driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      heading: location.heading,
      speed: location.speed,
      recordedAt: location.recordedAt,
      isFresh,
    };
  }
  async assignDriver(id: string, dto: AssignDriverDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDriverAssignment(tx, dto.driverId);
      const ride = await tx.ride.findUnique({
        where: { id },
        include: this.defaultInclude(),
      });
      if (!ride) throw new NotFoundException('Ride not found');

      if (ride.status !== RideStatus.REQUESTED) {
        throw new BadRequestException(
          `Driver can only be assigned while ride is REQUESTED. Current status is ${ride.status}`,
        );
      }

      if (ride.driverId || ride.vehicleId) {
        throw new BadRequestException(
          'Ride already has an assigned driver and vehicle',
        );
      }

      const driver = await tx.driver.findUnique({
        where: {
          id: dto.driverId,
        },
        include: {
          vehicles: {
            where: {
              status: 'ACTIVE',
            },
            take: 1,
          },
        },
      });

      if (!driver) {
        throw new NotFoundException('Driver not found');
      }

      if (driver.status !== 'APPROVED') {
        throw new BadRequestException(
          `Driver is not approved. Current status is ${driver.status}`,
        );
      }

      if (!driver.isOnline) {
        throw new BadRequestException('Driver is not online');
      }

      if (!driver.isAvailable) {
        throw new BadRequestException('Driver is not available');
      }

      if (ride.serviceZoneId && driver.serviceZoneId !== ride.serviceZoneId) {
        throw new BadRequestException(
          'Driver is not assigned to the ride service zone',
        );
      }

      const activeVehicle = driver.vehicles[0];

      if (!activeVehicle) {
        throw new BadRequestException('Selected driver has no active vehicle');
      }

      // Never trust the availability flag alone, including legacy incorrect flags.
      if (await hasActiveDriverRide(tx, driver.id)) {
        throw new BadRequestException('Driver is not available');
      }
      /*
       * Atomically claim the driver.
       *
       * If another assignment claims the same driver first,
       * this update affects zero records.
       */
      const claimedDriver = await tx.driver.updateMany({
        where: {
          id: driver.id,
          status: 'APPROVED',
          isOnline: true,
          isAvailable: true,
        },
        data: {
          isAvailable: false,
        },
      });

      if (claimedDriver.count !== 1) {
        throw new BadRequestException(
          'Driver is no longer available and may have been assigned to another ride',
        );
      }

      /*
       * Atomically claim the ride.
       *
       * If another dispatcher assigns this ride first,
       * this update affects zero records.
       */
      const claimedRide = await tx.ride.updateMany({
        where: {
          id,
          status: RideStatus.REQUESTED,
          driverId: null,
          vehicleId: null,
        },
        data: {
          driverId: driver.id,
          vehicleId: activeVehicle.id,
          status: RideStatus.ACCEPTED,
        },
      });

      if (claimedRide.count !== 1) {
        throw new BadRequestException(
          'Ride is no longer available for driver assignment',
        );
      }

      await tx.rideAuditEvent.create({
        data: {
          rideId: id,
          eventType: RideAuditEventType.DRIVER_ASSIGNED,
          previousStatus: RideStatus.REQUESTED,
          newStatus: RideStatus.ACCEPTED,
          driverId: driver.id,
          vehicleId: activeVehicle.id,
          actorType: RideAuditActorType.ADMIN,
        },
      });

      await this.notificationsService.createDriverRideAssignedItem(
        tx,
        id,
        driver.id,
      );

      const assignedRide = await tx.ride.findUnique({
        where: {
          id,
        },
        include: this.defaultInclude(),
      });

      if (!assignedRide) {
        throw new NotFoundException('Ride could not be found after assignment');
      }

      return assignedRide;
    }, DRIVER_TRANSACTION_OPTIONS);
  }

  async updateStatus(
    id: string,
    dto: UpdateRideStatusDto,
    authenticatedDriverId?: string,
  ) {
    const observedRide = await this.prisma.ride.findUnique({
      where: { id },
      select: { driverId: true },
    });
    if (!observedRide) throw new NotFoundException('Ride not found');
    return this.prisma.$transaction(async (tx) => {
      if (observedRide.driverId) {
        await lockDriverAssignment(tx, observedRide.driverId);
      }
      const ride = await tx.ride.findUnique({
        where: { id },
        include: this.defaultInclude(),
      });
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.driverId !== observedRide.driverId) {
        throw new BadRequestException(
          'Ride assignment changed. Refresh and retry',
        );
      }

      if (authenticatedDriverId && ride.driverId !== authenticatedDriverId) {
        throw new NotFoundException('Assigned ride not found');
      }

      assertRideStatusTransition(ride.status, dto.status);

      const releasingStatuses: RideStatus[] = [
        RideStatus.COMPLETED,
        RideStatus.CANCELLED,
        RideStatus.NO_DRIVER_AVAILABLE,
      ];

      const driverIdToRelease =
        ride.driverId && releasingStatuses.includes(dto.status)
          ? ride.driverId
          : undefined;

      const shouldCreateSettlement = dto.status === RideStatus.COMPLETED;

      const finalFareAmount = shouldCreateSettlement
        ? (ride.finalFare ?? ride.estimatedFare)
        : undefined;

      if (
        shouldCreateSettlement &&
        (finalFareAmount === undefined ||
          finalFareAmount === null ||
          finalFareAmount <= 0)
      ) {
        throw new BadRequestException(
          'Cannot complete ride without a valid finalFare or estimatedFare',
        );
      }

      const changedRide = await tx.ride.updateMany({
        where: {
          id,
          status: ride.status,
          driverId: ride.driverId,
        },
        data: {
          status: dto.status,
          notes: dto.notes ?? undefined,
          ...(shouldCreateSettlement ? { finalFare: finalFareAmount } : {}),
        },
      });

      if (changedRide.count !== 1) {
        throw new BadRequestException('Ride changed. Refresh and retry');
      }
      await tx.rideAuditEvent.create({
        data: {
          rideId: id,
          eventType: RideAuditEventType.STATUS_CHANGED,
          previousStatus: ride.status,
          newStatus: dto.status,
          driverId: ride.driverId,
          vehicleId: ride.vehicleId,
          actorType: authenticatedDriverId
            ? RideAuditActorType.DRIVER
            : RideAuditActorType.ADMIN,
          actorId: authenticatedDriverId,
          notes: dto.notes,
        },
      });
      if (shouldCreateSettlement && finalFareAmount) {
        const finalFareDecimal = new Prisma.Decimal(finalFareAmount);

        const driverShare = finalFareDecimal.times(0.8).toDecimalPlaces(2);

        const companyShare = finalFareDecimal.times(0.2).toDecimalPlaces(2);

        await tx.rideSettlement.upsert({
          where: {
            rideId: id,
          },
          update: {
            finalFare: finalFareDecimal,
            driverShare,
            companyShare,
            driverId: ride.driverId,
            vehicleId: ride.vehicleId,
            status: RideSettlementStatus.PENDING,
          },
          create: {
            rideId: id,
            receiptNumber: this.generateReceiptNumber(),
            driverId: ride.driverId,
            vehicleId: ride.vehicleId,
            finalFare: finalFareDecimal,
            driverShare,
            companyShare,
            status: RideSettlementStatus.PENDING,
          },
        });
      }

      if (shouldCreateSettlement && finalFareAmount) {
        await tx.rideAuditEvent.create({
          data: {
            rideId: id,
            eventType: RideAuditEventType.SETTLEMENT_CREATED,
            driverId: ride.driverId,
            vehicleId: ride.vehicleId,
            actorType: authenticatedDriverId
              ? RideAuditActorType.DRIVER
              : RideAuditActorType.ADMIN,
            actorId: authenticatedDriverId,
            metadata: {
              finalFare: finalFareAmount.toString(),
              settlementStatus: RideSettlementStatus.PENDING,
            },
          },
        });
      }
      if (driverIdToRelease) {
        const stillBusy = await hasActiveDriverRide(tx, driverIdToRelease);
        // Correct stale flags first; only an eligible, idle driver is released.
        await tx.driver.updateMany({
          where: { id: driverIdToRelease },
          data: { isAvailable: false },
        });
        if (!stillBusy) {
          await tx.driver.updateMany({
            where: {
              id: driverIdToRelease,
              status: 'APPROVED',
              isOnline: true,
              vehicles: { some: { status: 'ACTIVE' } },
            },
            data: { isAvailable: true },
          });
        }
      } else if (ride.driverId) {
        await tx.driver.updateMany({
          where: { id: ride.driverId },
          data: { isAvailable: false },
        });
      }

      return tx.ride.findUnique({
        where: {
          id,
        },
        include: this.defaultInclude(),
      });
    }, DRIVER_TRANSACTION_OPTIONS);
  }

  async getSettlement(id: string) {
    const ride = await this.prisma.ride.findUnique({
      where: {
        id,
      },
      include: {
        settlement: true,
        driver: true,
        vehicle: true,
        serviceZone: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (!ride.settlement) {
      throw new NotFoundException('Ride settlement not found');
    }

    return {
      rideId: ride.id,
      rideStatus: ride.status,
      riderName: ride.riderName,
      riderPhone: ride.riderPhone,
      pickupLabel: ride.pickupLabel,
      pickupAddress: ride.pickupAddress,
      dropoffLabel: ride.dropoffLabel,
      dropoffAddress: ride.dropoffAddress,
      requestedAt: ride.requestedAt,
      completedAt: ride.updatedAt,

      driver: ride.driver
        ? {
            id: ride.driver.id,
            fullName: ride.driver.fullName,
            phone: ride.driver.phone,
          }
        : null,

      vehicle: ride.vehicle
        ? {
            id: ride.vehicle.id,
            plateNumber: ride.vehicle.plateNumber,
            make: ride.vehicle.make,
            model: ride.vehicle.model,
            color: ride.vehicle.color,
          }
        : null,

      serviceZone: ride.serviceZone
        ? {
            id: ride.serviceZone.id,
            name: ride.serviceZone.name,
          }
        : null,

      settlement: ride.settlement,
    };
  }

  async markSettlementPaid(id: string) {
    const ride = await this.findOne(id);

    if (!ride.settlement) {
      throw new NotFoundException('Ride settlement not found');
    }

    if (ride.settlement.status !== RideSettlementStatus.PENDING) {
      throw new BadRequestException(
        `Only PENDING settlements can be marked as PAID. Current status is ${ride.settlement.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rideSettlement.update({
        where: {
          rideId: id,
        },
        data: {
          status: RideSettlementStatus.PAID,
        },
      });

      await tx.rideAuditEvent.create({
        data: {
          rideId: id,
          eventType: RideAuditEventType.SETTLEMENT_PAID,
          driverId: ride.driverId,
          vehicleId: ride.vehicleId,
          actorType: RideAuditActorType.ADMIN,
          metadata: {
            previousSettlementStatus: RideSettlementStatus.PENDING,
            newSettlementStatus: RideSettlementStatus.PAID,
          },
        },
      });
    });
    return this.findOne(id);
  }

  private async assertRiderOwnsRide(
    id: string,
    riderId: string,
  ): Promise<void> {
    const ride = await this.prisma.ride.findFirst({
      where: {
        id,
        riderId,
      },
      select: {
        id: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
  }

  private generateReceiptNumber() {
    const timestamp = Date.now();

    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');

    return `RCP-${timestamp}-${random}`;
  }

  private defaultInclude() {
    return {
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
    };
  }
}
