import { DriverLocationReplayController } from './driver-location-replay.controller';
import { DriverLocationReplayService } from './driver-location-replay.service';
import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { DriverAuthModule } from '../driver-auth/driver-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverLocationsController } from './driver-locations.controller';
import { DriverLocationsService } from './driver-locations.service';

@Module({
  imports: [PrismaModule, AdminAuthModule, DriverAuthModule],
  controllers: [DriverLocationsController, DriverLocationReplayController],
  providers: [DriverLocationsService, DriverLocationReplayService],
  exports: [DriverLocationsService],
})
export class DriverLocationsModule {}
