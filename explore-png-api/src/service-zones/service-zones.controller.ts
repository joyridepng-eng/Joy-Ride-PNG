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
import { ServiceZonesService } from './service-zones.service';
import { CreateServiceZoneDto } from './dto/create-service-zone.dto';
import { UpdateServiceZoneDto } from './dto/update-service-zone.dto';

@Controller('service-zones')
export class ServiceZonesController {
  constructor(private readonly serviceZonesService: ServiceZonesService) {}

  @Post()
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  create(@Body() dto: CreateServiceZoneDto) {
    return this.serviceZonesService.create(dto);
  }

  @Get()
  findAll(@Query('locationId') locationId?: string) {
    return this.serviceZonesService.findAll(locationId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.serviceZonesService.findOne(id);
  }

  @Patch(':id')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  update(@Param('id') id: string, @Body() dto: UpdateServiceZoneDto) {
    return this.serviceZonesService.update(id, dto);
  }

  @Delete(':id')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.serviceZonesService.remove(id);
  }
}
