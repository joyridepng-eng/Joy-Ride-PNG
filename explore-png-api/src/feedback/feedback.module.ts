import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { DriverAuthModule } from '../driver-auth/driver-auth.module';
import { RiderAuthModule } from '../rider-auth/rider-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRateLimitGuard } from './feedback-rate-limit.guard';

@Module({
  imports: [PrismaModule, AdminAuthModule, DriverAuthModule, RiderAuthModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRateLimitGuard],
})
export class FeedbackModule {}
