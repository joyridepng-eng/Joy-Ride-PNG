import { DriverStatus } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLocationHistoryQueryDto } from './dto/driver-location-history-query.dto';
import { UpsertDriverLocationDto } from './dto/upsert-driver-location.dto';

@Injectable()
export class DriverLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async history(
    query: DriverLocationHistoryQueryDto,
    authenticatedDriverId: string,
  ) {
    const ride = await this.prisma.ride.findUnique({
      where: {
        id: query.rideId,
      },
      select: {
        id: true,
        driverId: true,
      },
    });

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }

    if (authenticatedDriverId && ride.driverId !== authenticatedDriverId) {
      throw new ForbiddenException(
        'Driver is not authorized to access this ride history',
      );
    }

    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException(
        'History start time must not be after end time',
      );
    }

    const cursor = query.cursor
      ? this.decodeHistoryCursor(query.cursor)
      : undefined;

    const items = await this.prisma.driverLocationHistory.findMany({
      where: {
        rideId: query.rideId,
        AND: [
          {
            recordedAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          },
          ...(cursor
            ? [
                {
                  OR: [
                    {
                      recordedAt: {
                        gt: cursor.recordedAt,
                      },
                    },
                    {
                      recordedAt: cursor.recordedAt,
                      id: {
                        gt: cursor.id,
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [
        {
          recordedAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      take: query.limit + 1,
    });

    const hasNextPage = items.length > query.limit;
    const pageItems = hasNextPage ? items.slice(0, query.limit) : items;
    const lastItem = pageItems.at(-1);

    return {
      items: pageItems,
      nextCursor:
        hasNextPage && lastItem
          ? this.encodeHistoryCursor(lastItem.recordedAt, lastItem.id)
          : null,
    };
  }

  private encodeHistoryCursor(recordedAt: Date, id: string) {
    return Buffer.from(
      JSON.stringify({
        recordedAt: recordedAt.toISOString(),
        id,
      }),
    ).toString('base64url');
  }

  private decodeHistoryCursor(cursor: string) {
    try {
      const parsed = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      ) as {
        recordedAt?: unknown;
        id?: unknown;
      };

      if (
        typeof parsed.recordedAt !== 'string' ||
        typeof parsed.id !== 'string' ||
        !parsed.id
      ) {
        throw new Error('Invalid cursor payload');
      }

      const recordedAt = new Date(parsed.recordedAt);

      if (Number.isNaN(recordedAt.getTime())) {
        throw new Error('Invalid cursor timestamp');
      }

      return {
        recordedAt,
        id: parsed.id,
      };
    } catch {
      throw new BadRequestException('Invalid history cursor');
    }
  }
  async upsert(dto: UpsertDriverLocationDto, authenticatedDriverId?: string) {
    if (authenticatedDriverId && dto.driverId !== authenticatedDriverId) {
      throw new ForbiddenException(
        'Driver cannot update another driver location',
      );
    }

    // Validate here as well as in DTOs, including calls from other services.
    if (
      !Number.isFinite(dto.latitude) ||
      Math.abs(dto.latitude) > 90 ||
      !Number.isFinite(dto.longitude) ||
      Math.abs(dto.longitude) > 180
    ) {
      throw new BadRequestException('Latitude or longitude is invalid');
    }

    for (const field of ['accuracy', 'speed', 'heading'] as const) {
      const value = dto[field];
      if (
        value != null &&
        (typeof value !== 'number' ||
          !Number.isFinite(value) ||
          value < 0 ||
          (field === 'heading' && value >= 360))
      ) {
        throw new BadRequestException(`Invalid location ${field}`);
      }
    }

    if (
      dto.recordedAt != null &&
      (typeof dto.recordedAt !== 'string' || dto.recordedAt.trim() === '')
    ) {
      throw new BadRequestException('Location timestamp is invalid');
    }
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    if (!Number.isFinite(recordedAt.getTime())) {
      throw new BadRequestException('Location timestamp is invalid');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${dto.driverId}, 0)
        )
      `;

      const driver = await tx.driver.findUnique({
        where: {
          id: dto.driverId,
        },
      });

      if (!driver) {
        throw new NotFoundException('Driver not found');
      }

      if (dto.rideId) {
        const ride = await tx.ride.findUnique({
          where: {
            id: dto.rideId,
          },
          select: {
            driverId: true,
          },
        });

        if (!ride) {
          throw new NotFoundException('Ride not found');
        }

        if (ride.driverId !== dto.driverId) {
          throw new BadRequestException('Ride is not assigned to this driver');
        }
      }

      const existingLocation = await tx.driverLocation.findUnique({
        where: {
          driverId: dto.driverId,
        },
        select: {
          recordedAt: true,
        },
      });

      if (existingLocation && recordedAt < existingLocation.recordedAt) {
        throw new BadRequestException(
          'Location update is older than the current driver location',
        );
      }

      const currentLocation = await tx.driverLocation.upsert({
        where: {
          driverId: dto.driverId,
        },
        update: {
          latitude: dto.latitude,
          longitude: dto.longitude,
          heading: dto.heading,
          speed: dto.speed,
          accuracy: dto.accuracy,
          recordedAt,
        },
        create: {
          driverId: dto.driverId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          heading: dto.heading,
          speed: dto.speed,
          accuracy: dto.accuracy,
          recordedAt,
        },
        include: {
          driver: {
            // Return only the basic driver fields used by fleet clients.
            select: {
              id: true,
              fullName: true,
              isOnline: true,
              isAvailable: true,
            },
          },
        },
      });

      await tx.driverLocationHistory.create({
        data: {
          driverId: dto.driverId,
          rideId: dto.rideId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          heading: dto.heading,
          speed: dto.speed,
          accuracy: dto.accuracy,
          recordedAt,
        },
      });

      return currentLocation;
    });
  }
  async fleet() {
    return this.prisma.driverLocation.findMany({
      where: { driver: { status: { not: DriverStatus.INACTIVE } } },
      orderBy: {
        recordedAt: 'desc',
      },
      include: {
        driver: {
          select: {
            status: true,
            id: true,
            fullName: true,
            isOnline: true,
            isAvailable: true,
          },
        },
      },
    });
  }
}
