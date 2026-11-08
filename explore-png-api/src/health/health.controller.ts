import { Controller, Get, Header } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  getHealth() {
    return this.healthService.getReadiness();
  }

  @Get('ready')
  @Header('Cache-Control', 'no-store')
  getReadiness() {
    return this.healthService.getReadiness();
  }

  @Get('live')
  @Header('Cache-Control', 'no-store')
  getLiveness() {
    return this.healthService.getLiveness();
  }
}
