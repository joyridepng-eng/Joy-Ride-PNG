import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DriverStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLocationHistoryBatchDto } from './dto/driver-location-history-batch.dto';

@Injectable()
export class DriverLocationReplayService {
  constructor(private readonly prisma: PrismaService) {}

  private historyId(driverId: string, pointId: string): string {
    return (
      'offline_' +
      createHash('sha256')
        .update(JSON.stringify([driverId, pointId]))
        .digest('hex')
    );
  }

  async replay(
    dto: DriverLocationHistoryBatchDto,
    driverId: string,
  ): Promise<{ acceptedIds: string[] }> {
    if (!driverId) {
      throw new UnauthorizedException('Driver authentication required');
    }
    if (
      !Array.isArray(dto.points) ||
      dto.points.length < 1 ||
      dto.points.length > 100
    ) {
      throw new BadRequestException('Invalid history batch size');
    }

    const ids = new Set<string>();
    const maximumTime = Date.now() + 5 * 60 * 1000;
    const minimumTime = Date.UTC(2000, 0, 1);

    for (const point of dto.points) {
      if (
        !point ||
        typeof point.id !== 'string' ||
        !/^[A-Za-z0-9_-]{16,100}$/.test(point.id) ||
        typeof point.rideId !== 'string' ||
        !point.rideId.trim() ||
        point.rideId.length > 100 ||
        ids.has(point.id)
      ) {
        throw new BadRequestException('Invalid or repeated history identifier');
      }
      ids.add(point.id);

      if (
        !Number.isFinite(point.latitude) ||
        Math.abs(point.latitude) > 90 ||
        !Number.isFinite(point.longitude) ||
        Math.abs(point.longitude) > 180
      ) {
        throw new BadRequestException('Invalid history coordinates');
      }
      for (const field of ['heading', 'speed'] as const) {
        const value = point[field];
        if (
          value != null &&
          (typeof value !== 'number' ||
            !Number.isFinite(value) ||
            value < 0 ||
            (field === 'heading' && value >= 360))
        ) {
          throw new BadRequestException('Invalid history measurement');
        }
      }
      const time =
        typeof point.recordedAt === 'string'
          ? Date.parse(point.recordedAt)
          : NaN;
      if (!Number.isFinite(time) || time < minimumTime || time > maximumTime) {
        throw new BadRequestException('Invalid history timestamp');
      }
    }

    const data = dto.points.map((point) => ({
      id: this.historyId(driverId, point.id),
      driverId,
      rideId: point.rideId,
      latitude: point.latitude,
      longitude: point.longitude,
      heading: point.heading ?? null,
      speed: point.speed ?? null,
      accuracy: null,
      recordedAt: new Date(point.recordedAt),
    }));

    return this.prisma.$transaction(
      async (tx) => {
        const driver = await tx.driver.findUnique({
          where: { id: driverId },
          select: { id: true, status: true },
        });
        if (!driver || driver.status !== DriverStatus.APPROVED) {
          throw new ForbiddenException('Approved driver required');
        }

        const rideIds = [...new Set(dto.points.map((point) => point.rideId))];
        const rides = await tx.ride.findMany({
          where: { id: { in: rideIds } },
          select: { id: true, driverId: true },
        });
        if (
          rides.length !== rideIds.length ||
          rides.some((ride) => ride.driverId !== driverId)
        ) {
          throw new ForbiddenException('History ride ownership check failed');
        }

        await tx.driverLocationHistory.createMany({
          data,
          skipDuplicates: true,
        });

        const stored = await tx.driverLocationHistory.findMany({
          where: { id: { in: data.map((point) => point.id) } },
          select: {
            id: true,
            driverId: true,
            rideId: true,
            latitude: true,
            longitude: true,
            heading: true,
            speed: true,
            accuracy: true,
            recordedAt: true,
          },
        });

        const byId = new Map(stored.map((point) => [point.id, point]));
        for (const point of data) {
          const existing = byId.get(point.id);
          if (
            !existing ||
            existing.driverId !== point.driverId ||
            existing.rideId !== point.rideId ||
            existing.latitude !== point.latitude ||
            existing.longitude !== point.longitude ||
            existing.heading !== point.heading ||
            existing.speed !== point.speed ||
            existing.accuracy !== null ||
            existing.recordedAt.getTime() !== point.recordedAt.getTime()
          ) {
            throw new ConflictException('History identifier payload conflict');
          }
        }

        return { acceptedIds: dto.points.map((point) => point.id) };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
