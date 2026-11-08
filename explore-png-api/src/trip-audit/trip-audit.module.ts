import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TripAuditController } from './trip-audit.controller';
import { TripAuditService } from './trip-audit.service';

@Module({
  imports: [PrismaModule, AdminAuthModule],
  controllers: [TripAuditController],
  providers: [TripAuditService],
  exports: [TripAuditService],
})
export class TripAuditModule {}
