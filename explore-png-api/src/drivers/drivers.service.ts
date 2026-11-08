import {
  lockDriverAssignment,
  hasActiveDriverRide,
  DRIVER_TRANSACTION_OPTIONS,
  withEffectiveAvailability,
} from '../common/driver-assignment-lock';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, ServiceStatus, VehicleStatus } from '@prisma/client';
import { haversineDistanceKm } from '../common/geo/haversine';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { NearbyDriversQueryDto } from './dto/nearby-drivers-query.dto';
import { UpdateDriverAvailabilityDto } from './dto/update-driver-availability.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateDriverDto) {
    return this.prisma.driver.create({
      data: {
        fullName: dto.fullName.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim().toLowerCase(),
        licenseNumber: dto.licenseNumber?.trim().toUpperCase(),
        licenseClass: dto.licenseClass?.trim(),
        licenseIssuedAt:
          dto.licenseIssuedAt === undefined
            ? undefined
            : new Date(dto.licenseIssuedAt),
        licenseExpiresAt:
          dto.licenseExpiresAt === undefined
            ? undefined
            : new Date(dto.licenseExpiresAt),
        dateOfBirth:
          dto.dateOfBirth === undefined ? undefined : new Date(dto.dateOfBirth),
        emergencyContactName: dto.emergencyContactName?.trim(),
        emergencyContactPhone: dto.emergencyContactPhone?.trim(),
        emergencyContactRelationship: dto.emergencyContactRelationship?.trim(),
        status: DriverStatus.PENDING,
        isOnline: false,
        isAvailable: false,
        locationId:
          dto.locationId === undefined ? undefined : Number(dto.locationId),
        serviceZoneId: dto.serviceZoneId,
      },
      ...this.defaultQuery(),
    });
  }

  async findAll() {
    const drivers = await this.prisma.driver.findMany({
      orderBy: { createdAt: 'desc' },
      ...this.defaultQuery(),
    });
    return withEffectiveAvailability(this.prisma, drivers);
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id },
      ...this.defaultQuery(),
    });

    if (!driver) throw new NotFoundException('Driver not found');
    return (await withEffectiveAvailability(this.prisma, [driver]))[0];
  }

  async update(id: string, dto: UpdateDriverDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDriverAssignment(tx, id);
      const driver = await tx.driver.findUnique({
        where: { id },
        ...this.defaultQuery(),
      });
      if (!driver) throw new NotFoundException('Driver not found');
      const busy = await hasActiveDriverRide(tx, id);
      if (
        busy &&
        dto.status !== undefined &&
        dto.status !== DriverStatus.APPROVED
      ) {
        throw new BadRequestException(
          'Resolve the active ride before suspending or deactivating this driver.',
        );
      }

      const {
        locationId,
        licenseIssuedAt,
        licenseExpiresAt,
        dateOfBirth,
        ...rest
      } = dto;

      const nextStatus = dto.status ?? driver.status;
      const nextIsOnline = dto.isOnline ?? driver.isOnline;

      const mustForceOffline =
        nextStatus !== DriverStatus.APPROVED || !nextIsOnline;

      return tx.driver.update({
        where: { id },
        data: {
          ...rest,
          isAvailable: !busy && (dto.isAvailable ?? driver.isAvailable),
          fullName: rest.fullName?.trim(),
          phone: rest.phone?.trim(),
          email:
            rest.email === undefined
              ? undefined
              : rest.email.trim().toLowerCase(),
          licenseNumber:
            rest.licenseNumber === undefined
              ? undefined
              : rest.licenseNumber.trim().toUpperCase(),
          licenseClass: rest.licenseClass?.trim(),
          emergencyContactName: rest.emergencyContactName?.trim(),
          emergencyContactPhone: rest.emergencyContactPhone?.trim(),
          emergencyContactRelationship:
            rest.emergencyContactRelationship?.trim(),
          locationId: locationId === undefined ? undefined : Number(locationId),
          licenseIssuedAt:
            licenseIssuedAt === undefined
              ? undefined
              : new Date(licenseIssuedAt),
          licenseExpiresAt:
            licenseExpiresAt === undefined
              ? undefined
              : new Date(licenseExpiresAt),
          dateOfBirth:
            dateOfBirth === undefined ? undefined : new Date(dateOfBirth),
          ...(mustForceOffline
            ? {
                isOnline: false,
                isAvailable: false,
              }
            : {}),
        },
        ...this.defaultQuery(),
      });
    }, DRIVER_TRANSACTION_OPTIONS);
  }

  async updateStatus(id: string, status: DriverStatus) {
    return this.prisma.$transaction(async (tx) => {
      await lockDriverAssignment(tx, id);
      const driver = await tx.driver.findUnique({
        where: { id },
        ...this.defaultQuery(),
      });
      if (!driver) throw new NotFoundException('Driver not found');
      const busy = await hasActiveDriverRide(tx, id);
      if (busy && status !== DriverStatus.APPROVED) {
        throw new BadRequestException(
          'Resolve the active ride before suspending or deactivating this driver.',
        );
      }

      if (status === DriverStatus.APPROVED) {
        this.assertReadyForApproval(driver);

        return tx.driver.update({
          where: { id },
          data: {
            status: DriverStatus.APPROVED,
            isAvailable: driver.isOnline && driver.isAvailable && !busy,
            approvedAt: driver.approvedAt ?? new Date(),
            suspensionReason: null,
          },
          ...this.defaultQuery(),
        });
      }

      await tx.vehicle.updateMany({
        where: {
          driverId: id,
          status: VehicleStatus.ACTIVE,
        },
        data: {
          status: VehicleStatus.INACTIVE,
        },
      });

      return tx.driver.update({
        where: { id },
        data: {
          status,
          isOnline: false,
          isAvailable: false,
        },
        ...this.defaultQuery(),
      });
    }, DRIVER_TRANSACTION_OPTIONS);
  }

  async updateAvailability(id: string, dto: UpdateDriverAvailabilityDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockDriverAssignment(tx, id);
      const driver = await tx.driver.findUnique({
        where: { id },
        ...this.defaultQuery(),
      });
      if (!driver) throw new NotFoundException('Driver not found');
      const busy = await hasActiveDriverRide(tx, id);

      if (driver.status !== DriverStatus.APPROVED) {
        if (dto.isOnline === true || dto.isAvailable === true) {
          throw new BadRequestException(
            'Only approved drivers can be online or available',
          );
        }

        return tx.driver.update({
          where: { id },
          data: {
            isOnline: false,
            isAvailable: false,
          },
          ...this.defaultQuery(),
        });
      }

      const nextIsOnline = dto.isOnline ?? driver.isOnline;

      if (!nextIsOnline) {
        return tx.driver.update({
          where: { id },
          data: {
            isOnline: false,
            isAvailable: false,
          },
          ...this.defaultQuery(),
        });
      }

      // Going online while busy is allowed for GPS, but cannot release the driver.
      const nextIsAvailable = !busy && (dto.isAvailable ?? driver.isAvailable);

      return tx.driver.update({
        where: { id },
        data: {
          isOnline: true,
          isAvailable: nextIsAvailable,
        },
        ...this.defaultQuery(),
      });
    }, DRIVER_TRANSACTION_OPTIONS);
  }

  remove(id: string) {
    return this.updateStatus(id, DriverStatus.INACTIVE);
  }

  async findNearby(query: NearbyDriversQueryDto) {
    const radiusKm = Number(query.radiusKm ?? 5);
    const maxLocationAgeSeconds = Number(query.maxLocationAgeSeconds ?? 120);
    const locationCutoff = new Date(Date.now() - maxLocationAgeSeconds * 1000);

    const origin = {
      latitude: Number(query.latitude),
      longitude: Number(query.longitude),
    };

    const drivers = await this.prisma.driver.findMany({
      where: {
        status: DriverStatus.APPROVED,
        isOnline: true,
        isAvailable: true,
        locationPing: {
          is: {
            recordedAt: {
              gte: locationCutoff,
            },
          },
        },
        ...(query.locationId ? { locationId: Number(query.locationId) } : {}),
        ...(query.serviceZoneId ? { serviceZoneId: query.serviceZoneId } : {}),
        OR: [
          { location: { serviceStatus: ServiceStatus.ACTIVE } },
          { serviceZone: { serviceStatus: ServiceStatus.ACTIVE } },
        ],
      },
      ...this.defaultQuery(),
    });

    const effectiveDrivers = await withEffectiveAvailability(
      this.prisma,
      drivers,
    );
    return effectiveDrivers
      .filter((driver) => driver.isAvailable)
      .map((driver) => {
        const ping = driver.locationPing;

        if (!ping || ping.recordedAt < locationCutoff) {
          return null;
        }

        const distanceKm = haversineDistanceKm(origin, {
          latitude: ping.latitude,
          longitude: ping.longitude,
        });

        return {
          ...driver,
          distanceKm: Number(distanceKm.toFixed(2)),
          activeVehicle:
            driver.vehicles.find(
              (vehicle) => vehicle.status === VehicleStatus.ACTIVE,
            ) ?? null,
        };
      })
      .filter((driver): driver is NonNullable<typeof driver> => {
        return driver !== null && driver.distanceKm <= radiusKm;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }

  private assertReadyForApproval(driver: {
    licenseNumber?: string | null;
    licenseClass?: string | null;
    licenseIssuedAt?: Date | null;
    licenseExpiresAt?: Date | null;
    dateOfBirth?: Date | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    emergencyContactRelationship?: string | null;
  }) {
    if (!driver.licenseNumber?.trim()) {
      throw new BadRequestException(
        'Driver licence number is required before approval',
      );
    }

    const missingFields: string[] = [];

    if (!driver.licenseClass?.trim()) missingFields.push('licenseClass');
    if (!driver.licenseIssuedAt) missingFields.push('licenseIssuedAt');
    if (!driver.licenseExpiresAt) missingFields.push('licenseExpiresAt');
    if (!driver.dateOfBirth) missingFields.push('dateOfBirth');

    if (!driver.emergencyContactName?.trim()) {
      missingFields.push('emergencyContactName');
    }

    if (!driver.emergencyContactPhone?.trim()) {
      missingFields.push('emergencyContactPhone');
    }

    if (!driver.emergencyContactRelationship?.trim()) {
      missingFields.push('emergencyContactRelationship');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Driver profile is incomplete: ${missingFields.join(', ')}`,
      );
    }

    const now = new Date();

    if (driver.licenseIssuedAt! > now) {
      throw new BadRequestException(
        'Driver licence issue date cannot be in the future',
      );
    }

    if (driver.licenseExpiresAt! <= now) {
      throw new BadRequestException(
        'Driver licence must be valid at the time of approval',
      );
    }

    if (driver.licenseIssuedAt! >= driver.licenseExpiresAt!) {
      throw new BadRequestException(
        'Driver licence expiry must be after its issue date',
      );
    }

    if (driver.dateOfBirth! >= now) {
      throw new BadRequestException('Driver date of birth must be in the past');
    }
  }

  private defaultQuery() {
    return {
      omit: {
        passwordHash: true,
      },
      include: {
        location: true,
        serviceZone: true,
        locationPing: true,
        vehicles: true,
      },
    } as const;
  }
}
