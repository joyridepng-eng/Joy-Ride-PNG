import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DriverStatus,
  EmergencyAlertAction,
  EmergencyAlertStatus,
  NotificationAudience,
  NotificationEventType,
  Prisma,
  VehicleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminEmergencyListDto,
  CreateEmergencyDto,
  EmergencyListDto,
} from './dto/emergency.dto';

import { normalizeEmergencyLocation as location } from './emergency-location';

const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5000,
  timeout: 15000,
} as const;
const driverSelect = {
  id: true,
  clientRequestId: true,
  rideId: true,
  status: true,
  message: true,
  latitude: true,
  longitude: true,
  accuracyMeters: true,
  locationRecordedAt: true,
  locationSource: true,
  clientOccurredAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { notificationInboxItems: true } },
} satisfies Prisma.DriverEmergencyAlertSelect;
type DriverAlert = Prisma.DriverEmergencyAlertGetPayload<{
  select: typeof driverSelect;
}>;
const adminSelect = {
  ...driverSelect,
  driverId: true,
  driver: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      vehicles: {
        where: { status: VehicleStatus.ACTIVE },
        select: { id: true, plateNumber: true },
      },
    },
  },
  ride: {
    select: {
      id: true,
      status: true,
      vehicle: { select: { id: true, plateNumber: true } },
    },
  },
} satisfies Prisma.DriverEmergencyAlertSelect;
const adminDetailSelect = {
  ...adminSelect,
  events: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    take: 3,
    select: {
      id: true,
      action: true,
      adminId: true,
      note: true,
      createdAt: true,
      admin: { select: { id: true, fullName: true } },
    },
  },
} satisfies Prisma.DriverEmergencyAlertSelect;

function clientDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= Date.now() + 60000
    ? new Date(time)
    : null;
}
function driverResponse(item: DriverAlert) {
  const { _count, ...alert } = item;
  const age = alert.locationRecordedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - alert.locationRecordedAt.getTime()) / 1000),
      )
    : null;
  return {
    ...alert,
    serverReceived: true,
    serverReceivedAt: alert.createdAt,
    humanAcknowledged: alert.acknowledgedAt !== null,
    adminInboxItemCount: _count.notificationInboxItems,
    locationAccepted: alert.latitude !== null && alert.longitude !== null,
    locationAgeSeconds: age,
    locationIsStale: age === null || age > 120,
  };
}

function adminResponse<T extends { locationRecordedAt: Date | null }>(item: T) {
  const age = item.locationRecordedAt
    ? Math.max(
        0,
        Math.floor((Date.now() - item.locationRecordedAt.getTime()) / 1000),
      )
    : null;
  return {
    ...item,
    locationAgeSeconds: age,
    locationIsStale: age === null || age > 120,
  };
}

@Injectable()
export class EmergenciesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(driverId: string, dto: CreateEmergencyDto) {
    const clientRequestId = dto.clientRequestId.toLowerCase();
    const rideId = dto.rideId ?? null;
    const message = dto.message?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      // Emergency-specific lock avoids acquiring the assignment advisory lock.
      const key = `joyride:driver-emergency:${driverId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const driver = await tx.driver.findFirst({
        where: {
          id: driverId,
          isAuthActive: true,
          status: { in: [DriverStatus.APPROVED, DriverStatus.SUSPENDED] },
        },
        select: { id: true },
      });
      if (!driver)
        throw new UnauthorizedException('Driver authentication is required');
      const existing = await tx.driverEmergencyAlert.findUnique({
        where: { driverId_clientRequestId: { driverId, clientRequestId } },
        select: driverSelect,
      });
      if (existing) {
        if (existing.rideId !== rideId || existing.message !== message) {
          throw new ConflictException(
            'This request identifier already belongs to a different alert',
          );
        }
        // Metadata can arrive differently on retries; preserve the first receipt.
        return driverResponse(existing);
      }
      if (
        rideId &&
        !(await tx.ride.findFirst({
          where: { id: rideId, driverId },
          select: { id: true },
        }))
      ) {
        throw new NotFoundException('Assigned ride not found');
      }
      const alert = await tx.driverEmergencyAlert.create({
        data: {
          driverId,
          clientRequestId,
          rideId,
          message,
          ...location(dto.location),
          clientOccurredAt: clientDate(dto.clientOccurredAt),
        },
        select: { id: true },
      });
      await tx.emergencyAlertEvent.create({
        data: { alertId: alert.id, action: EmergencyAlertAction.CREATED },
      });
      const admins = await tx.adminAccount.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      if (admins.length) {
        await tx.notificationInboxItem.createMany({
          data: admins.map((admin) => ({
            audience: NotificationAudience.ADMIN,
            eventType: NotificationEventType.DRIVER_EMERGENCY_ALERT,
            adminId: admin.id,
            emergencyAlertId: alert.id,
            title: 'Driver emergency alert',
            body: 'Open the Admin emergency queue to review and respond.',
            deduplicationKey: `emergency:${alert.id}:admin:${admin.id}`,
          })),
          skipDuplicates: true,
        });
      }
      return driverResponse(
        await tx.driverEmergencyAlert.findUniqueOrThrow({
          where: { id: alert.id },
          select: driverSelect,
        }),
      );
    }, options);
  }

  async getMine(driverId: string, id: string) {
    const item = await this.prisma.driverEmergencyAlert.findFirst({
      where: { id, driverId },
      select: driverSelect,
    });
    if (!item) throw new NotFoundException('Emergency alert not found');
    return driverResponse(item);
  }

  async listMine(driverId: string, query: EmergencyListDto) {
    const items = await this.prisma.driverEmergencyAlert.findMany({
      where: { driverId, status: query.status },
      select: driverSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const more = items.length > query.limit;
    if (more) items.pop();
    return {
      items: items.map(driverResponse),
      nextCursor: more ? items[items.length - 1].id : null,
    };
  }

  async listAdmin(query: AdminEmergencyListDto) {
    const items = await this.prisma.driverEmergencyAlert.findMany({
      where: {
        driverId: query.driverId,
        status: query.status ?? {
          in: [EmergencyAlertStatus.OPEN, EmergencyAlertStatus.ACKNOWLEDGED],
        },
      },
      select: adminSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const more = items.length > query.limit;
    if (more) items.pop();
    return {
      items: items.map(adminResponse),
      nextCursor: more ? items[items.length - 1].id : null,
    };
  }

  async getAdmin(id: string) {
    const item = await this.prisma.driverEmergencyAlert.findUnique({
      where: { id },
      select: adminDetailSelect,
    });
    if (!item) throw new NotFoundException('Emergency alert not found');
    return adminResponse(item);
  }

  async acknowledge(adminId: string, id: string, note?: string) {
    return this.act(
      adminId,
      id,
      EmergencyAlertAction.ACKNOWLEDGED,
      note?.trim() || null,
    );
  }

  async resolve(adminId: string, id: string, note: string) {
    return this.act(adminId, id, EmergencyAlertAction.RESOLVED, note.trim());
  }

  private async act(
    adminId: string,
    id: string,
    action: 'ACKNOWLEDGED' | 'RESOLVED',
    note: string | null,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "DriverEmergencyAlert" WHERE id = ${id} FOR UPDATE`;
      if (rows.length !== 1)
        throw new NotFoundException('Emergency alert not found');
      const alert = await tx.driverEmergencyAlert.findUniqueOrThrow({
        where: { id },
        select: { status: true, acknowledgedAt: true },
      });
      const previous = await tx.emergencyAlertEvent.findUnique({
        where: { alertId_action: { alertId: id, action } },
      });
      if (previous) {
        if (previous.adminId === adminId && previous.note === note) {
          return adminResponse(
            await tx.driverEmergencyAlert.findUniqueOrThrow({
              where: { id },
              select: adminDetailSelect,
            }),
          );
        }
        throw new ConflictException(
          'This action was already recorded; refresh the alert',
        );
      }
      const expected =
        action === EmergencyAlertAction.ACKNOWLEDGED
          ? EmergencyAlertStatus.OPEN
          : EmergencyAlertStatus.ACKNOWLEDGED;
      if (alert.status !== expected)
        throw new ConflictException(
          'Alert status changed or acknowledgement is required',
        );
      const now = new Date(
        Math.max(Date.now(), alert.acknowledgedAt?.getTime() ?? 0),
      );
      await tx.driverEmergencyAlert.update({
        where: { id },
        data:
          action === EmergencyAlertAction.ACKNOWLEDGED
            ? { status: EmergencyAlertStatus.ACKNOWLEDGED, acknowledgedAt: now }
            : { status: EmergencyAlertStatus.RESOLVED, resolvedAt: now },
      });
      await tx.emergencyAlertEvent.create({
        data: { alertId: id, action, adminId, note, createdAt: now },
      });
      return adminResponse(
        await tx.driverEmergencyAlert.findUniqueOrThrow({
          where: { id },
          select: adminDetailSelect,
        }),
      );
    }, options);
  }
}
