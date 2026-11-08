import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { DriverAuthModule } from '../driver-auth/driver-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmergenciesController } from './emergencies.controller';
import { EmergenciesService } from './emergencies.service';
import { EmergencyDriverGuard } from './emergency-driver.guard';
import { EmergencyRateLimitGuard } from './emergency-rate-limit.guard';

@Module({
  imports: [PrismaModule, AdminAuthModule, DriverAuthModule],
  controllers: [EmergenciesController],
  providers: [
    EmergenciesService,
    EmergencyDriverGuard,
    EmergencyRateLimitGuard,
  ],
})
export class EmergenciesModule {}
