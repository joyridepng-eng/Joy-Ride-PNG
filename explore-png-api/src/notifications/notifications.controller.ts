import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import type { AdminAuthenticatedRequest } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { NotificationInboxQueryDto } from './dto/notification-inbox-query.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('admin/me')
  @UseGuards(AdminJwtAuthGuard)
  getMyAdminInbox(
    @Req() request: AdminAuthenticatedRequest,
    @Query() query: NotificationInboxQueryDto,
  ) {
    const admin = request.admin;

    if (!admin) {
      throw new UnauthorizedException('Admin authentication is required');
    }

    return this.notificationsService.listAdminInbox(admin.id, query);
  }

  @Patch('admin/me/read-all')
  @UseGuards(AdminJwtAuthGuard)
  markMyAdminInboxRead(@Req() request: AdminAuthenticatedRequest) {
    const admin = request.admin;

    if (!admin) {
      throw new UnauthorizedException('Admin authentication is required');
    }

    return this.notificationsService.markAllAdminItemsRead(admin.id);
  }

  @Patch('admin/me/:id/read')
  @UseGuards(AdminJwtAuthGuard)
  markMyAdminItemRead(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const admin = request.admin;

    if (!admin) {
      throw new UnauthorizedException('Admin authentication is required');
    }

    return this.notificationsService.markAdminItemRead(admin.id, id);
  }

  @Get('driver/me')
  @UseGuards(DriverJwtAuthGuard)
  getMyDriverInbox(
    @Req() request: DriverAuthenticatedRequest,
    @Query() query: NotificationInboxQueryDto,
  ) {
    const driver = request.driver;

    if (!driver) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return this.notificationsService.listDriverInbox(driver.id, query);
  }

  @Patch('driver/me/read-all')
  @UseGuards(DriverJwtAuthGuard)
  markMyDriverInboxRead(@Req() request: DriverAuthenticatedRequest) {
    const driver = request.driver;

    if (!driver) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return this.notificationsService.markAllDriverItemsRead(driver.id);
  }

  @Patch('driver/me/:id/read')
  @UseGuards(DriverJwtAuthGuard)
  markMyDriverItemRead(
    @Req() request: DriverAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const driver = request.driver;

    if (!driver) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return this.notificationsService.markDriverItemRead(driver.id, id);
  }
}
