import { Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationAudience,
  NotificationEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationInboxQueryDto } from './dto/notification-inbox-query.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly inboxSelect = {
    emergencyAlertId: true,
    emergencyAlert: { select: { id: true, status: true, createdAt: true } },
    id: true,
    audience: true,
    eventType: true,
    title: true,
    body: true,
    isRead: true,
    readAt: true,
    createdAt: true,
    updatedAt: true,
    ride: {
      select: {
        id: true,
        status: true,
        pickupLabel: true,
        pickupAddress: true,
        dropoffLabel: true,
        dropoffAddress: true,
        requestedAt: true,
        driver: {
          select: {
            id: true,
            fullName: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            plateNumber: true,
          },
        },
      },
    },
  } satisfies Prisma.NotificationInboxItemSelect;

  async listAdminInbox(adminId: string, query: NotificationInboxQueryDto) {
    return this.listInbox(
      {
        audience: NotificationAudience.ADMIN,
        adminId,
      },
      query,
    );
  }

  async listDriverInbox(driverId: string, query: NotificationInboxQueryDto) {
    return this.listInbox(
      {
        audience: NotificationAudience.DRIVER,
        driverId,
      },
      query,
    );
  }

  async markAdminItemRead(adminId: string, itemId: string) {
    return this.markItemRead({
      audience: NotificationAudience.ADMIN,
      adminId,
      id: itemId,
    });
  }

  async markDriverItemRead(driverId: string, itemId: string) {
    return this.markItemRead({
      audience: NotificationAudience.DRIVER,
      driverId,
      id: itemId,
    });
  }

  async markAllAdminItemsRead(adminId: string) {
    return this.markAllRead({
      audience: NotificationAudience.ADMIN,
      adminId,
    });
  }

  async markAllDriverItemsRead(driverId: string) {
    return this.markAllRead({
      audience: NotificationAudience.DRIVER,
      driverId,
    });
  }

  async createAdminRideRequestedItems(
    tx: Prisma.TransactionClient,
    rideId: string,
  ): Promise<number> {
    const administrators = await tx.adminAccount.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    if (administrators.length === 0) {
      return 0;
    }

    const result = await tx.notificationInboxItem.createMany({
      data: administrators.map((administrator) => ({
        audience: NotificationAudience.ADMIN,
        eventType: NotificationEventType.RIDE_REQUESTED,
        title: 'New Joy Ride Request',
        body: 'A new Rider request is waiting for driver assignment.',
        adminId: administrator.id,
        rideId,
        deduplicationKey: `ride:${rideId}:requested:admin:${administrator.id}`,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async createDriverRideAssignedItem(
    tx: Prisma.TransactionClient,
    rideId: string,
    driverId: string,
  ): Promise<number> {
    const result = await tx.notificationInboxItem.createMany({
      data: [
        {
          audience: NotificationAudience.DRIVER,
          eventType: NotificationEventType.RIDE_ASSIGNED,
          title: 'Joy Ride Assigned',
          body: 'A new ride has been assigned to you. Open the ride to review pickup and drop-off.',
          driverId,
          rideId,
          deduplicationKey: `ride:${rideId}:assigned:driver:${driverId}`,
        },
      ],
      skipDuplicates: true,
    });

    return result.count;
  }

  private async listInbox(
    recipient:
      | {
          audience: typeof NotificationAudience.ADMIN;
          adminId: string;
        }
      | {
          audience: typeof NotificationAudience.DRIVER;
          driverId: string;
        },
    query: NotificationInboxQueryDto,
  ) {
    const where: Prisma.NotificationInboxItemWhereInput = {
      ...recipient,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [items, unreadCount] = await this.prisma.$transaction([
      this.prisma.notificationInboxItem.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: query.limit,
        select: this.inboxSelect,
      }),
      this.prisma.notificationInboxItem.count({
        where: {
          ...recipient,
          isRead: false,
        },
      }),
    ]);

    return {
      unreadCount,
      items,
    };
  }

  private async markItemRead(
    recipient:
      | {
          audience: typeof NotificationAudience.ADMIN;
          adminId: string;
          id: string;
        }
      | {
          audience: typeof NotificationAudience.DRIVER;
          driverId: string;
          id: string;
        },
  ) {
    const result = await this.prisma.notificationInboxItem.updateMany({
      where: recipient,
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Notification inbox item not found');
    }

    return this.prisma.notificationInboxItem.findFirst({
      where: recipient,
      select: this.inboxSelect,
    });
  }

  private async markAllRead(
    recipient:
      | {
          audience: typeof NotificationAudience.ADMIN;
          adminId: string;
        }
      | {
          audience: typeof NotificationAudience.DRIVER;
          driverId: string;
        },
  ) {
    const result = await this.prisma.notificationInboxItem.updateMany({
      where: {
        ...recipient,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return {
      updatedCount: result.count,
    };
  }
}
