import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceZonesController } from './service-zones.controller';
import { ServiceZonesService } from './service-zones.service';

@Module({
  imports: [PrismaModule, AdminAuthModule],
  controllers: [ServiceZonesController],
  providers: [ServiceZonesService],
  exports: [ServiceZonesService],
})
export class ServiceZonesModule {}
