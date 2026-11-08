import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import type { AdminAuthenticatedRequest } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import {
  AcknowledgeEmergencyDto,
  AdminEmergencyListDto,
  CreateEmergencyDto,
  EmergencyIdParamsDto,
  EmergencyListDto,
  ResolveEmergencyDto,
} from './dto/emergency.dto';
import { EmergencyDriverGuard } from './emergency-driver.guard';
import { EmergencyRateLimitGuard } from './emergency-rate-limit.guard';
import { EmergenciesService } from './emergencies.service';

@Controller('emergencies')
export class EmergenciesController {
  constructor(private readonly emergencies: EmergenciesService) {}

  @Post('driver/me')
  @HttpCode(200)
  @UseGuards(EmergencyDriverGuard, EmergencyRateLimitGuard)
  create(
    @Req() req: DriverAuthenticatedRequest,
    @Body() dto: CreateEmergencyDto,
  ) {
    if (!req.driver)
      throw new UnauthorizedException('Driver authentication is required');
    return this.emergencies.create(req.driver.id, dto);
  }

  @Get('driver/me')
  @UseGuards(EmergencyDriverGuard, EmergencyRateLimitGuard)
  listMine(
    @Req() req: DriverAuthenticatedRequest,
    @Query() query: EmergencyListDto,
  ) {
    if (!req.driver)
      throw new UnauthorizedException('Driver authentication is required');
    return this.emergencies.listMine(req.driver.id, query);
  }

  @Get('driver/me/:id')
  @UseGuards(EmergencyDriverGuard, EmergencyRateLimitGuard)
  getMine(
    @Req() req: DriverAuthenticatedRequest,
    @Param() params: EmergencyIdParamsDto,
  ) {
    if (!req.driver)
      throw new UnauthorizedException('Driver authentication is required');
    return this.emergencies.getMine(req.driver.id, params.id);
  }

  @Get('admin')
  @UseGuards(AdminJwtAuthGuard, EmergencyRateLimitGuard)
  listAdmin(
    @Req() req: AdminAuthenticatedRequest,
    @Query() query: AdminEmergencyListDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.emergencies.listAdmin(query);
  }

  @Get('admin/:id')
  @UseGuards(AdminJwtAuthGuard, EmergencyRateLimitGuard)
  getAdmin(
    @Req() req: AdminAuthenticatedRequest,
    @Param() params: EmergencyIdParamsDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.emergencies.getAdmin(params.id);
  }

  @Patch('admin/:id/acknowledge')
  @UseGuards(AdminJwtAuthGuard, EmergencyRateLimitGuard)
  acknowledge(
    @Req() req: AdminAuthenticatedRequest,
    @Param() params: EmergencyIdParamsDto,
    @Body() dto: AcknowledgeEmergencyDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.emergencies.acknowledge(req.admin.id, params.id, dto.note);
  }

  @Patch('admin/:id/resolve')
  @UseGuards(AdminJwtAuthGuard, EmergencyRateLimitGuard)
  resolve(
    @Req() req: AdminAuthenticatedRequest,
    @Param() params: EmergencyIdParamsDto,
    @Body() dto: ResolveEmergencyDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.emergencies.resolve(req.admin.id, params.id, dto.note);
  }
}
