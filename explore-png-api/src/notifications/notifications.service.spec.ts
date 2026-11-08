import 'reflect-metadata';
import {
  NotificationAudience,
  NotificationEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationInboxQueryDto } from './dto/notification-inbox-query.dto';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const prismaMock = {
    adminAccount: {
      findMany: jest.fn(),
    },
    notificationInboxItem: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();

    prismaMock.$transaction.mockImplementation(
      (operations: Promise<unknown>[]) => Promise.all(operations),
    );

    service = new NotificationsService(prismaMock as unknown as PrismaService);
  });

  it('lists only the authenticated Admin inbox and its unread count', async () => {
    const item = {
      id: 'notification-1',
      title: 'New Joy Ride Request',
    };

    prismaMock.notificationInboxItem.findMany.mockResolvedValue([item]);
    prismaMock.notificationInboxItem.count.mockResolvedValue(1);

    const query = Object.assign(new NotificationInboxQueryDto(), {
      limit: 25,
      unreadOnly: true,
    });

    const result: unknown = await service.listAdminInbox('admin-1', query);

    expect(prismaMock.notificationInboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          audience: NotificationAudience.ADMIN,
          adminId: 'admin-1',
          isRead: false,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 25,
      }),
    );

    expect(prismaMock.notificationInboxItem.count).toHaveBeenCalledWith({
      where: {
        audience: NotificationAudience.ADMIN,
        adminId: 'admin-1',
        isRead: false,
      },
    });

    expect(result).toEqual({
      unreadCount: 1,
      items: [item],
    });
  });

  it('lists only the authenticated Driver inbox', async () => {
    prismaMock.notificationInboxItem.findMany.mockResolvedValue([]);
    prismaMock.notificationInboxItem.count.mockResolvedValue(0);

    const query = Object.assign(new NotificationInboxQueryDto(), {
      limit: 50,
      unreadOnly: false,
    });

    await service.listDriverInbox('driver-1', query);

    expect(prismaMock.notificationInboxItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          audience: NotificationAudience.DRIVER,
          driverId: 'driver-1',
        },
      }),
    );

    expect(prismaMock.notificationInboxItem.count).toHaveBeenCalledWith({
      where: {
        audience: NotificationAudience.DRIVER,
        driverId: 'driver-1',
        isRead: false,
      },
    });
  });

  it('marks only an item belonging to the authenticated Admin as read', async () => {
    const updatedItem = {
      id: 'notification-1',
      isRead: true,
    };

    prismaMock.notificationInboxItem.updateMany.mockResolvedValue({
      count: 1,
    });

    prismaMock.notificationInboxItem.findFirst.mockResolvedValue(updatedItem);

    const result: unknown = await service.markAdminItemRead(
      'admin-1',
      'notification-1',
    );

    expect(prismaMock.notificationInboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        audience: NotificationAudience.ADMIN,
        adminId: 'admin-1',
        id: 'notification-1',
      },
      data: {
        isRead: true,
        readAt: expect.any(Date) as unknown,
      },
    });

    expect(prismaMock.notificationInboxItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          audience: NotificationAudience.ADMIN,
          adminId: 'admin-1',
          id: 'notification-1',
        },
      }),
    );

    expect(result).toEqual(updatedItem);
  });

  it('does not expose an inbox item belonging to another Driver', async () => {
    prismaMock.notificationInboxItem.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.markDriverItemRead('driver-1', 'other-driver-item'),
    ).rejects.toThrow('Notification inbox item not found');

    expect(prismaMock.notificationInboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        audience: NotificationAudience.DRIVER,
        driverId: 'driver-1',
        id: 'other-driver-item',
      },
      data: {
        isRead: true,
        readAt: expect.any(Date) as unknown,
      },
    });

    expect(prismaMock.notificationInboxItem.findFirst).not.toHaveBeenCalled();
  });

  it('marks all unread items for only the authenticated Driver', async () => {
    prismaMock.notificationInboxItem.updateMany.mockResolvedValue({
      count: 2,
    });

    const result: unknown = await service.markAllDriverItemsRead('driver-1');

    expect(prismaMock.notificationInboxItem.updateMany).toHaveBeenCalledWith({
      where: {
        audience: NotificationAudience.DRIVER,
        driverId: 'driver-1',
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: expect.any(Date) as unknown,
      },
    });

    expect(result).toEqual({
      updatedCount: 2,
    });
  });

  it('creates one deduplicated ride-request message for every active Admin', async () => {
    prismaMock.adminAccount.findMany.mockResolvedValue([
      {
        id: 'admin-1',
      },
      {
        id: 'admin-2',
      },
    ]);

    prismaMock.notificationInboxItem.createMany.mockResolvedValue({
      count: 2,
    });

    const result: unknown = await service.createAdminRideRequestedItems(
      prismaMock as unknown as Prisma.TransactionClient,
      'ride-1',
    );

    expect(prismaMock.adminAccount.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
      },
      select: {
        id: true,
      },
    });

    expect(prismaMock.notificationInboxItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          audience: NotificationAudience.ADMIN,
          eventType: NotificationEventType.RIDE_REQUESTED,
          title: 'New Joy Ride Request',
          body: 'A new Rider request is waiting for driver assignment.',
          adminId: 'admin-1',
          rideId: 'ride-1',
          deduplicationKey: 'ride:ride-1:requested:admin:admin-1',
        },
        {
          audience: NotificationAudience.ADMIN,
          eventType: NotificationEventType.RIDE_REQUESTED,
          title: 'New Joy Ride Request',
          body: 'A new Rider request is waiting for driver assignment.',
          adminId: 'admin-2',
          rideId: 'ride-1',
          deduplicationKey: 'ride:ride-1:requested:admin:admin-2',
        },
      ],
      skipDuplicates: true,
    });

    expect(result).toBe(2);
  });

  it('does not create an Admin message when there are no active Admins', async () => {
    prismaMock.adminAccount.findMany.mockResolvedValue([]);

    const result: unknown = await service.createAdminRideRequestedItems(
      prismaMock as unknown as Prisma.TransactionClient,
      'ride-1',
    );

    expect(prismaMock.notificationInboxItem.createMany).not.toHaveBeenCalled();

    expect(result).toBe(0);
  });

  it('creates an assignment message only for the assigned Driver', async () => {
    prismaMock.notificationInboxItem.createMany.mockResolvedValue({
      count: 1,
    });

    const result: unknown = await service.createDriverRideAssignedItem(
      prismaMock as unknown as Prisma.TransactionClient,
      'ride-1',
      'driver-1',
    );

    expect(prismaMock.notificationInboxItem.createMany).toHaveBeenCalledWith({
      data: [
        {
          audience: NotificationAudience.DRIVER,
          eventType: NotificationEventType.RIDE_ASSIGNED,
          title: 'Joy Ride Assigned',
          body: 'A new ride has been assigned to you. Open the ride to review pickup and drop-off.',
          driverId: 'driver-1',
          rideId: 'ride-1',
          deduplicationKey: 'ride:ride-1:assigned:driver:driver-1',
        },
      ],
      skipDuplicates: true,
    });

    expect(result).toBe(1);
  });
});
