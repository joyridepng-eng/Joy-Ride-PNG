import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { TripAuditQueryDto } from './dto/trip-audit-query.dto';
import { TripAuditService } from './trip-audit.service';

@Controller('trip-audit')
@UseGuards(AdminJwtAuthGuard)
export class TripAuditController {
  constructor(private readonly tripAuditService: TripAuditService) {}

  @Get()
  getReport(@Query() query: TripAuditQueryDto) {
    return this.tripAuditService.getReport(query);
  }
}
