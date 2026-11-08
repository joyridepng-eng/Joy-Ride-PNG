import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../prisma/prisma.module';
import { RiderJwtAuthGuard } from './guards/rider-jwt-auth/rider-jwt-auth.guard';
import { RiderAuthController } from './rider-auth.controller';
import { RiderAuthService } from './rider-auth.service';

@Module({
  imports: [
    PrismaModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('RIDER_JWT_SECRET'),
        signOptions: {
          expiresIn: '12h',
        },
      }),
    }),
  ],
  controllers: [RiderAuthController],
  providers: [RiderAuthService, RiderJwtAuthGuard],
  exports: [RiderAuthService, RiderJwtAuthGuard, JwtModule],
})
export class RiderAuthModule {}
