import { Injectable, NotFoundException } from '@nestjs/common';
import { ServiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceZoneDto } from './dto/create-service-zone.dto';
import { UpdateServiceZoneDto } from './dto/update-service-zone.dto';

@Injectable()
export class ServiceZonesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateServiceZoneDto) {
    return this.prisma.serviceZone.create({
      data: {
        name: dto.name,
        locationId:
          dto.locationId === undefined ? undefined : Number(dto.locationId),
        serviceStatus: dto.serviceStatus ?? ServiceStatus.COMING_SOON,
        zoneKind: dto.zoneKind,
        isAirportZone: dto.isAirportZone ?? false,
        isHotelZone: dto.isHotelZone ?? false,
        isPeripheryBuffer: dto.isPeripheryBuffer ?? false,
        centerLatitude: dto.centerLatitude,
        centerLongitude: dto.centerLongitude,
        coverageRadiusKm: dto.coverageRadiusKm ?? 0,
      },
      include: { location: true },
    });
  }

  findAll(locationId?: string) {
    return this.prisma.serviceZone.findMany({
      where: locationId ? { locationId: Number(locationId) } : undefined,
      orderBy: { name: 'asc' },
      include: { location: true },
    });
  }

  async findOne(id: string) {
    const zone = await this.prisma.serviceZone.findUnique({
      where: { id },
      include: { location: true },
    });

    if (!zone) throw new NotFoundException('Service zone not found');
    return zone;
  }

  async update(id: string, dto: UpdateServiceZoneDto) {
    await this.findOne(id);

    return this.prisma.serviceZone.update({
      where: { id },
      data: {
        ...dto,
        locationId:
          dto.locationId === undefined ? undefined : Number(dto.locationId),
      },
      include: { location: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.serviceZone.delete({ where: { id } });
  }
}
