import { EmergenciesModule } from './emergencies/emergencies.module';
import { FeedbackModule } from './feedback/feedback.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthRateLimitModule } from './common/rate-limit/auth-rate-limit.module';
import { environmentValidationSchema } from './config/environment.validation';
import { DriverAuthModule } from './driver-auth/driver-auth.module';
import { DriverEarningsModule } from './driver-earnings/driver-earnings.module';
import { DriverLocationsModule } from './driver-locations/driver-locations.module';
import { HealthModule } from './health/health.module';
import { DriversModule } from './drivers/drivers.module';
import { PrismaModule } from './prisma/prisma.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RiderAuthModule } from './rider-auth/rider-auth.module';
import { RidesModule } from './rides/rides.module';
import { RoutingModule } from './routing/routing.module';
import { ServiceZonesModule } from './service-zones/service-zones.module';
import { TripAuditModule } from './trip-audit/trip-audit.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      validationSchema: environmentValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    AuthRateLimitModule,
    PrismaModule,
    NotificationsModule,
    ServiceZonesModule,
    DriversModule,
    VehiclesModule,
    DriverLocationsModule,
    HealthModule,
    RidesModule,
    RoutingModule,
    AdminAuthModule,
    RiderAuthModule,
    DriverAuthModule,
    DriverEarningsModule,
    TripAuditModule,
    FeedbackModule,
    EmergenciesModule,
  ],
})
export class AppModule {}
