import { Module } from '@nestjs/common';
import { DriverAuthModule } from '../driver-auth/driver-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverEarningsController } from './driver-earnings.controller';
import { DriverEarningsService } from './driver-earnings.service';

@Module({
  imports: [PrismaModule, DriverAuthModule],
  controllers: [DriverEarningsController],
  providers: [DriverEarningsService],
})
export class DriverEarningsModule {}
