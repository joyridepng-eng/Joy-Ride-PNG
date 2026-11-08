import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverAuthController } from './driver-auth.controller';
import { DriverAuthService } from './driver-auth.service';
import { DriverJwtAuthGuard } from './guards/driver-jwt-auth/driver-jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    AdminAuthModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('DRIVER_JWT_SECRET'),
        signOptions: {
          expiresIn: '12h',
        },
      }),
    }),
  ],
  controllers: [DriverAuthController],
  providers: [DriverAuthService, DriverJwtAuthGuard],
  exports: [DriverAuthService, DriverJwtAuthGuard, JwtModule],
})
export class DriverAuthModule {}
