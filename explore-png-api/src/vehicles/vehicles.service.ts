import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateVehicleDto) {
    if (!dto.driverId) {
      throw new BadRequestException('Vehicle must be assigned to a driver');
    }

    return this.prisma.vehicle.create({
      data: {
        plateNumber: dto.plateNumber.trim().toUpperCase(),
        make: dto.make?.trim(),
        model: dto.model?.trim(),
        year: dto.year === undefined ? undefined : Number(dto.year),
        color: dto.color?.trim(),
        seatCount:
          dto.seatCount === undefined ? undefined : Number(dto.seatCount),
        chassisNumber: dto.chassisNumber?.trim().toUpperCase(),
        registrationNumber: dto.registrationNumber?.trim().toUpperCase(),
        registrationExpiresAt:
          dto.registrationExpiresAt === undefined
            ? undefined
            : new Date(dto.registrationExpiresAt),
        status: VehicleStatus.PENDING,
        driverId: dto.driverId,
      },
      include: { driver: true },
    });
  }

  findAll(driverId?: string) {
    return this.prisma.vehicle.findMany({
      where: driverId ? { driverId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { driver: true },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { driver: true },
    });

    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.findOne(id);

    if (
      dto.status === VehicleStatus.APPROVED ||
      dto.status === VehicleStatus.ACTIVE
    ) {
      this.assertCompleteProfile({
        make: dto.make ?? vehicle.make,
        model: dto.model ?? vehicle.model,
        year: dto.year ?? vehicle.year,
        color: dto.color ?? vehicle.color,
        seatCount: dto.seatCount ?? vehicle.seatCount,
        chassisNumber: dto.chassisNumber ?? vehicle.chassisNumber,
        registrationNumber:
          dto.registrationNumber ?? vehicle.registrationNumber,
        registrationExpiresAt:
          dto.registrationExpiresAt === undefined
            ? vehicle.registrationExpiresAt
            : new Date(dto.registrationExpiresAt),
      });
    }

    const activatingVehicle = dto.status === VehicleStatus.ACTIVE;

    if (
      activatingVehicle &&
      vehicle.status !== VehicleStatus.APPROVED &&
      vehicle.status !== VehicleStatus.ACTIVE
    ) {
      throw new BadRequestException(
        'Vehicle must be approved before activation',
      );
    }

    const changingActiveVehicleDriver =
      vehicle.status === VehicleStatus.ACTIVE && dto.driverId !== undefined;

    if (activatingVehicle || changingActiveVehicleDriver) {
      const nextDriverId = dto.driverId ?? vehicle.driverId;
      await this.assertActiveVehicleDriver(nextDriverId, id);
    }

    const { year, seatCount, registrationExpiresAt, ...rest } = dto;

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...rest,
        plateNumber: rest.plateNumber?.trim().toUpperCase(),
        make: rest.make?.trim(),
        model: rest.model?.trim(),
        color: rest.color?.trim(),
        chassisNumber: rest.chassisNumber?.trim().toUpperCase(),
        registrationNumber: rest.registrationNumber?.trim().toUpperCase(),
        year: year === undefined ? undefined : Number(year),
        seatCount: seatCount === undefined ? undefined : Number(seatCount),
        registrationExpiresAt:
          registrationExpiresAt === undefined
            ? undefined
            : new Date(registrationExpiresAt),
        ...(dto.status === VehicleStatus.APPROVED
          ? {
              approvedAt: vehicle.approvedAt ?? new Date(),
              suspensionReason: null,
            }
          : {}),
      },
      include: { driver: true },
    });
  }

  private assertCompleteProfile(vehicle: {
    make?: string | null;
    model?: string | null;
    year?: number | null;
    color?: string | null;
    seatCount?: number | null;
    chassisNumber?: string | null;
    registrationNumber?: string | null;
    registrationExpiresAt?: Date | null;
  }) {
    const missingFields: string[] = [];

    if (!vehicle.make?.trim()) missingFields.push('make');
    if (!vehicle.model?.trim()) missingFields.push('model');
    if (!vehicle.year || vehicle.year < 1900) missingFields.push('year');
    if (!vehicle.color?.trim()) missingFields.push('color');
    if (!vehicle.seatCount || vehicle.seatCount < 1) {
      missingFields.push('seatCount');
    }
    if (!vehicle.chassisNumber?.trim()) {
      missingFields.push('chassisNumber');
    }
    if (!vehicle.registrationNumber?.trim()) {
      missingFields.push('registrationNumber');
    }
    if (!vehicle.registrationExpiresAt) {
      missingFields.push('registrationExpiresAt');
    }

    if (missingFields.length > 0) {
      throw new BadRequestException(
        `Vehicle profile is incomplete: ${missingFields.join(', ')}`,
      );
    }

    if (vehicle.registrationExpiresAt! <= new Date()) {
      throw new BadRequestException(
        'Vehicle registration must be valid at the time of approval or activation',
      );
    }
  }

  private async assertActiveVehicleDriver(
    driverId?: string | null,
    excludeVehicleId?: string,
  ) {
    if (!driverId) {
      throw new BadRequestException(
        'Active vehicle must be assigned to a driver',
      );
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { status: true },
    });

    if (!driver || driver.status !== DriverStatus.APPROVED) {
      throw new BadRequestException(
        'Active vehicle can only be assigned to an approved driver',
      );
    }

    const existingActiveVehicle = await this.prisma.vehicle.findFirst({
      where: {
        driverId,
        status: VehicleStatus.ACTIVE,
        ...(excludeVehicleId
          ? {
              id: {
                not: excludeVehicleId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (existingActiveVehicle) {
      throw new BadRequestException('Driver already has an active vehicle');
    }
  }
  updateDriverAssignment(id: string, driverId: string) {
    return this.update(id, { driverId });
  }

  updateStatus(id: string, status: VehicleStatus) {
    return this.update(id, { status });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.vehicle.update({
      where: { id },
      data: {
        status: VehicleStatus.INACTIVE,
      },
      include: { driver: true },
    });
  }
}
