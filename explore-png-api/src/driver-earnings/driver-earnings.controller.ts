import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverEarningsService } from './driver-earnings.service';

@Controller('driver-earnings')
@UseGuards(DriverJwtAuthGuard)
export class DriverEarningsController {
  constructor(private readonly driverEarningsService: DriverEarningsService) {}

  @Get('me/daily')
  getMyDailyStatement(
    @Req() request: DriverAuthenticatedRequest,
    @Query('date') date?: string,
  ) {
    const driver = request.driver;

    if (!driver) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return this.driverEarningsService.getDailyStatement(driver.id, date);
  }
}
