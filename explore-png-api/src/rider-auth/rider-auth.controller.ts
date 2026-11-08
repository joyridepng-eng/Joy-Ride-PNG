import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { RiderLoginDto } from './dto/rider-login.dto';
import { RiderRegisterDto } from './dto/rider-register.dto';
import { RiderAuthService } from './rider-auth.service';

@Controller('rider-auth')
export class RiderAuthController {
  constructor(private readonly riderAuthService: RiderAuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  register(@Body() dto: RiderRegisterDto) {
    return this.riderAuthService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  login(@Body() dto: RiderLoginDto) {
    return this.riderAuthService.login(dto);
  }
}
