import { SuperAdminOnly } from '../admin-auth/super-admin-only.decorator';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverAuthService } from './driver-auth.service';
import { DriverLoginDto } from './dto/driver-login.dto';
import { SetDriverCredentialsDto } from './dto/set-driver-credentials.dto';

@Controller('driver-auth')
export class DriverAuthController {
  constructor(private readonly driverAuthService: DriverAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  login(@Body() dto: DriverLoginDto) {
    return this.driverAuthService.login(dto);
  }

  @Patch(':driverId/credentials')
  @SuperAdminOnly()
  @UseGuards(AdminJwtAuthGuard)
  setCredentials(
    @Param('driverId') driverId: string,
    @Body() dto: SetDriverCredentialsDto,
  ) {
    return this.driverAuthService.setCredentials(driverId, dto);
  }
}
