import { SuperAdminOnly } from '../admin-auth/super-admin-only.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { CreateDriverDto } from './dto/create-driver.dto';
import { NearbyDriversQueryDto } from './dto/nearby-drivers-query.dto';
import { UpdateDriverAvailabilityDto } from './dto/update-driver-availability.dto';
import { UpdateDriverProfileDto } from './dto/update-driver-profile.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { DriversService } from './drivers.service';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  @UseGuards(AdminJwtAuthGuard)
  findAll() {
    return this.driversService.findAll();
  }

  @Get('nearby')
  @UseGuards(AdminJwtAuthGuard)
  nearby(@Query() query: NearbyDriversQueryDto) {
    return this.driversService.findNearby(query);
  }

  @Get('me')
  @UseGuards(DriverJwtAuthGuard)
  findMe(@Req() request: DriverAuthenticatedRequest) {
    return this.driversService.findOne(this.getAuthenticatedDriverId(request));
  }

  @Patch('me/availability')
  @UseGuards(DriverJwtAuthGuard)
  updateMyAvailability(
    @Req() request: DriverAuthenticatedRequest,
    @Body() dto: UpdateDriverAvailabilityDto,
  ) {
    return this.driversService.updateAvailability(
      this.getAuthenticatedDriverId(request),
      dto,
    );
  }

  @Get(':id')
  @UseGuards(AdminJwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(':id/status')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateDriverStatusDto) {
    return this.driversService.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateDriverProfileDto) {
    return this.driversService.update(id, dto);
  }

  @Delete(':id')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
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
