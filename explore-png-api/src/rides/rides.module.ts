import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { DriverAuthModule } from '../driver-auth/driver-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RiderAuthModule } from '../rider-auth/rider-auth.module';
import { RoutingModule } from '../routing/routing.module';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';

@Module({
  imports: [
    PrismaModule,
    AdminAuthModule,
    RiderAuthModule,
    DriverAuthModule,
    NotificationsModule,
    RoutingModule,
  ],
  controllers: [RidesController],
  providers: [RidesService],
  exports: [RidesService],
})
export class RidesModule {}
