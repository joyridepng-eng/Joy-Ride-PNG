import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverLocationsService } from './driver-locations.service';
import { DriverLocationHistoryQueryDto } from './dto/driver-location-history-query.dto';
import { DriverLocationUpdateDto } from './dto/driver-location-update.dto';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';

@Controller('driver-locations')
export class DriverLocationsController {
  constructor(
    private readonly driverLocationsService: DriverLocationsService,
  ) {}

  @Get('fleet')
  @UseGuards(AdminJwtAuthGuard)
  fleet() {
    return this.driverLocationsService.fleet();
  }

  @Get('history')
  @UseGuards(DriverJwtAuthGuard)
  history(
    @Query() query: DriverLocationHistoryQueryDto,
    @Req() request: DriverAuthenticatedRequest,
  ) {
    return this.driverLocationsService.history(
      query,
      this.getAuthenticatedDriverId(request),
    );
  }

  @Post('upsert')
  @UseGuards(DriverJwtAuthGuard)
  upsert(
    @Body() dto: DriverLocationUpdateDto,
    @Req() request: DriverAuthenticatedRequest,
  ) {
    const driverId = this.getAuthenticatedDriverId(request);

    return this.driverLocationsService.upsert(
      {
        ...dto,
        driverId,
      },
      driverId,
    );
  }

  private getAuthenticatedDriverId(
    request: DriverAuthenticatedRequest,
  ): string {
    if (!request.driver?.id) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return request.driver.id;
  }
}
