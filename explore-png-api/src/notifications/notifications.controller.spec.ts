import { UnauthorizedException } from '@nestjs/common';
import type { AdminAuthenticatedRequest } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { NotificationInboxQueryDto } from './dto/notification-inbox-query.dto';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  const notificationsMock = {
    listAdminInbox: jest.fn(),
    markAllAdminItemsRead: jest.fn(),
    markAdminItemRead: jest.fn(),
    listDriverInbox: jest.fn(),
    markAllDriverItemsRead: jest.fn(),
    markDriverItemRead: jest.fn(),
  };

  const adminRequest = {
    admin: {
      id: 'admin-1',
    },
  } as unknown as AdminAuthenticatedRequest;

  const driverRequest = {
    driver: {
      id: 'driver-1',
    },
  } as unknown as DriverAuthenticatedRequest;

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new NotificationsController(
      notificationsMock as unknown as NotificationsService,
    );
  });

  it('uses the authenticated Admin identity when listing Admin messages', () => {
    const query = new NotificationInboxQueryDto();
    const response = Promise.resolve({
      unreadCount: 1,
      items: [],
    });

    notificationsMock.listAdminInbox.mockReturnValue(response);

    expect(controller.getMyAdminInbox(adminRequest, query)).toBe(response);

    expect(notificationsMock.listAdminInbox).toHaveBeenCalledWith(
      'admin-1',
      query,
    );
  });

  it('rejects an Admin inbox request without an authenticated Admin', () => {
    const request = {} as AdminAuthenticatedRequest;
    const query = new NotificationInboxQueryDto();

    expect(() => controller.getMyAdminInbox(request, query)).toThrow(
      UnauthorizedException,
    );

    expect(notificationsMock.listAdminInbox).not.toHaveBeenCalled();
  });

  it('uses the authenticated Admin identity for read operations', async () => {
    await controller.markMyAdminItemRead(adminRequest, 'notification-1');
    await controller.markMyAdminInboxRead(adminRequest);

    expect(notificationsMock.markAdminItemRead).toHaveBeenCalledWith(
      'admin-1',
      'notification-1',
    );

    expect(notificationsMock.markAllAdminItemsRead).toHaveBeenCalledWith(
      'admin-1',
    );
  });

  it('uses the authenticated Driver identity when listing Driver messages', () => {
    const query = new NotificationInboxQueryDto();
    const response = Promise.resolve({
      unreadCount: 1,
      items: [],
    });

    notificationsMock.listDriverInbox.mockReturnValue(response);

    expect(controller.getMyDriverInbox(driverRequest, query)).toBe(response);

    expect(notificationsMock.listDriverInbox).toHaveBeenCalledWith(
      'driver-1',
      query,
    );
  });

  it('rejects a Driver inbox request without an authenticated Driver', () => {
    const request = {} as DriverAuthenticatedRequest;
    const query = new NotificationInboxQueryDto();

    expect(() => controller.getMyDriverInbox(request, query)).toThrow(
      UnauthorizedException,
    );

    expect(notificationsMock.listDriverInbox).not.toHaveBeenCalled();
  });

  it('uses the authenticated Driver identity for read operations', async () => {
    await controller.markMyDriverItemRead(driverRequest, 'notification-1');
    await controller.markMyDriverInboxRead(driverRequest);

    expect(notificationsMock.markDriverItemRead).toHaveBeenCalledWith(
      'driver-1',
      'notification-1',
    );

    expect(notificationsMock.markAllDriverItemsRead).toHaveBeenCalledWith(
      'driver-1',
    );
  });
});
