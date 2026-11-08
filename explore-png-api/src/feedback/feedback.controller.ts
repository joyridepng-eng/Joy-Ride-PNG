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
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { RiderJwtAuthGuard } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import type { RiderAuthenticatedRequest } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import {
  FeedbackDriverParamsDto,
  FeedbackItemParamsDto,
  FeedbackListDto,
  FeedbackRideParamsDto,
  ReviewFeedbackDto,
  SubmitFeedbackDto,
} from './dto/feedback.dto';
import { FeedbackRateLimitGuard } from './feedback-rate-limit.guard';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post('rider/me/rides/:rideId')
  @HttpCode(200)
  @UseGuards(RiderJwtAuthGuard, FeedbackRateLimitGuard)
  submit(
    @Req() req: RiderAuthenticatedRequest,
    @Param() params: FeedbackRideParamsDto,
    @Body() dto: SubmitFeedbackDto,
  ) {
    if (!req.rider)
      throw new UnauthorizedException('Rider authentication is required');
    return this.feedback.submit(req.rider.id, params.rideId, dto);
  }

  @Get('rider/me/rides/:rideId')
  @UseGuards(RiderJwtAuthGuard, FeedbackRateLimitGuard)
  async getMine(
    @Req() req: RiderAuthenticatedRequest,
    @Param() params: FeedbackRideParamsDto,
  ) {
    if (!req.rider)
      throw new UnauthorizedException('Rider authentication is required');
    return {
      feedback: await this.feedback.getMine(req.rider.id, params.rideId),
    };
  }

  @Get('driver/me/summary')
  @UseGuards(DriverJwtAuthGuard, FeedbackRateLimitGuard)
  summary(@Req() req: DriverAuthenticatedRequest) {
    if (!req.driver)
      throw new UnauthorizedException('Driver authentication is required');
    return this.feedback.driverSummary(req.driver.id);
  }

  @Get('admin')
  @UseGuards(AdminJwtAuthGuard, FeedbackRateLimitGuard)
  list(@Req() req: AdminAuthenticatedRequest, @Query() query: FeedbackListDto) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.feedback.listForAdmin(query);
  }

  @Get('admin/drivers/:driverId/summary')
  @UseGuards(AdminJwtAuthGuard, FeedbackRateLimitGuard)
  adminSummary(
    @Req() req: AdminAuthenticatedRequest,
    @Param() params: FeedbackDriverParamsDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.feedback.driverSummary(params.driverId);
  }

  @Get('admin/:id')
  @UseGuards(AdminJwtAuthGuard, FeedbackRateLimitGuard)
  detail(
    @Req() req: AdminAuthenticatedRequest,
    @Param() params: FeedbackItemParamsDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.feedback.getForAdmin(params.id);
  }

  @Patch('admin/:id/review')
  @UseGuards(AdminJwtAuthGuard, FeedbackRateLimitGuard)
  review(
    @Req() req: AdminAuthenticatedRequest,
    @Param() params: FeedbackItemParamsDto,
    @Body() dto: ReviewFeedbackDto,
  ) {
    if (!req.admin)
      throw new UnauthorizedException('Admin authentication is required');
    return this.feedback.review(req.admin.id, params.id, dto);
  }
}
