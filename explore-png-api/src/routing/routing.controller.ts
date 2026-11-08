import { Controller, Get, Query } from '@nestjs/common';
import { DrivingRouteQueryDto } from './dto/driving-route-query.dto';
import { RoutingService } from './routing.service';

@Controller('routing')
export class RoutingController {
  constructor(private readonly routingService: RoutingService) {}

  @Get('driving')
  getDrivingRoute(@Query() query: DrivingRouteQueryDto) {
    return this.routingService.getDrivingRoute(
      query.originLatitude,
      query.originLongitude,
      query.destinationLatitude,
      query.destinationLongitude,
    );
  }
}
