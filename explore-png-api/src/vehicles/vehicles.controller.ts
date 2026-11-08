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
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDriverDto } from './dto/update-vehicle-driver.dto';
import { UpdateVehicleProfileDto } from './dto/update-vehicle-profile.dto';
import { UpdateVehicleStatusDto } from './dto/update-vehicle-status.dto';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@UseGuards(AdminJwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @SuperAdminOnly()
  create(@Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(dto);
  }

  @Get()
  findAll(@Query('driverId') driverId?: string) {
    return this.vehiclesService.findAll(driverId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Patch(':id/driver')
  @SuperAdminOnly()
  updateDriverAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDriverDto,
  ) {
    return this.vehiclesService.updateDriverAssignment(id, dto.driverId);
  }

  @Patch(':id/status')
  @SuperAdminOnly()
  updateStatus(@Param('id') id: string, @Body() dto: UpdateVehicleStatusDto) {
    return this.vehiclesService.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @SuperAdminOnly()
  update(@Param('id') id: string, @Body() dto: UpdateVehicleProfileDto) {
    return this.vehiclesService.update(id, dto);
  }

  @Delete(':id')
  @SuperAdminOnly()
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}
