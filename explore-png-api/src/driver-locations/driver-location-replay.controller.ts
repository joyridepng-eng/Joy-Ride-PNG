import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverLocationHistoryBatchDto } from './dto/driver-location-history-batch.dto';
import { DriverLocationReplayService } from './driver-location-replay.service';

@Controller('driver-locations')
export class DriverLocationReplayController {
  constructor(private readonly replayService: DriverLocationReplayService) {}

  @Post('history/batch')
  @UseGuards(DriverJwtAuthGuard)
  replay(
    @Body() dto: DriverLocationHistoryBatchDto,
    @Req() request: DriverAuthenticatedRequest,
  ) {
    if (!request.driver?.id) {
      throw new UnauthorizedException('Driver authentication required');
    }
    return this.replayService.replay(dto, request.driver.id);
  }
}
