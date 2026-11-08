import { SuperAdminOnly } from '../admin-auth/super-admin-only.decorator';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { RiderJwtAuthGuard } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import type { RiderAuthenticatedRequest } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { CreateRideDto } from './dto/create-ride.dto';
import { UpdateRideStatusDto } from './dto/update-ride-status.dto';
import { RidesService } from './rides.service';

@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Post('quote')
  @UseGuards(RiderJwtAuthGuard)
  quote(@Req() request: RiderAuthenticatedRequest, @Body() dto: CreateRideDto) {
    if (!request.rider) {
      throw new UnauthorizedException('Rider authentication is required');
    }

    return this.ridesService.quote(dto);
  }

  @Post()
  @UseGuards(RiderJwtAuthGuard)
  create(
    @Req() request: RiderAuthenticatedRequest,
    @Body() dto: CreateRideDto,
  ) {
    const rider = request.rider;

    if (!rider) {
      throw new UnauthorizedException('Rider authentication is required');
    }

    return this.ridesService.create(dto, rider);
  }

  @Get()
  @UseGuards(AdminJwtAuthGuard)
  findAll(
    @Query('status') status?: string,
    @Query('locationId') locationId?: string,
    @Query('serviceZoneId') serviceZoneId?: string,
    @Query('driverId') driverId?: string,
  ) {
    return this.ridesService.findAll({
      status,
      locationId,
      serviceZoneId,
      driverId,
    });
  }

  @Get('driver/me/active')
  @UseGuards(DriverJwtAuthGuard)
  findMyActiveDriverRide(@Req() request: DriverAuthenticatedRequest) {
    const driver = request.driver;

    if (!driver) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return this.ridesService.findActiveDriverRide(driver.id);
  }

  @Patch('driver/me/:id/status')
  @UseGuards(DriverJwtAuthGuard)
  updateMyRideStatus(
    @Req() request: DriverAuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateRideStatusDto,
  ) {
    const driver = request.driver;

    if (!driver) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    return this.ridesService.updateDriverRideStatus(id, driver.id, dto);
  }

  @Get('driver/:driverId/active')
  @UseGuards(AdminJwtAuthGuard)
  findActiveDriverRide(@Param('driverId') driverId: string) {
    return this.ridesService.findActiveDriverRide(driverId);
  }

  @Get('me/:id/location')
  @UseGuards(RiderJwtAuthGuard)
  getMyCurrentLocation(
    @Req() request: RiderAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const rider = request.rider;

    if (!rider) {
      throw new UnauthorizedException('Rider authentication is required');
    }

    return this.ridesService.getRiderCurrentLocation(id, rider.id);
  }

  @Get('me/:id/settlement')
  @UseGuards(RiderJwtAuthGuard)
  getMySettlement(
    @Req() request: RiderAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const rider = request.rider;

    if (!rider) {
      throw new UnauthorizedException('Rider authentication is required');
    }

    return this.ridesService.getRiderSettlement(id, rider.id);
  }

  @Get('me/active')
  @UseGuards(RiderJwtAuthGuard)
  findMyActiveRiderRide(@Req() request: RiderAuthenticatedRequest) {
    const rider = request.rider;

    if (!rider) {
      throw new UnauthorizedException('Rider authentication required.');
    }

    return this.ridesService.findActiveRiderRide(rider.id);
  }

  @Get('me/:id')
  @UseGuards(RiderJwtAuthGuard)
  findMyRide(
    @Req() request: RiderAuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const rider = request.rider;

    if (!rider) {
      throw new UnauthorizedException('Rider authentication is required');
    }

    return this.ridesService.findRiderRide(id, rider.id);
  }

  @Get(':id/location')
  @UseGuards(AdminJwtAuthGuard)
  getCurrentLocation(@Param('id') id: string) {
    return this.ridesService.getCurrentLocation(id);
  }

  @Get(':id/settlement')
  @UseGuards(AdminJwtAuthGuard)
  getSettlement(@Param('id') id: string) {
    return this.ridesService.getSettlement(id);
  }

  @Patch(':id/settlement/paid')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  markSettlementPaid(@Param('id') id: string) {
    return this.ridesService.markSettlementPaid(id);
  }

  @Get(':id')
  @UseGuards(AdminJwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.ridesService.findOne(id);
  }

  @Patch(':id/assign-driver')
  @UseGuards(AdminJwtAuthGuard)
  assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
    return this.ridesService.assignDriver(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(AdminJwtAuthGuard)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateRideStatusDto) {
    return this.ridesService.updateStatus(id, dto);
  }
}
