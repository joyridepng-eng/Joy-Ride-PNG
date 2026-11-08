import { Module } from '@nestjs/common';
import { DriverLocationsModule } from './driver-locations/driver-locations.module';
import { DriversModule } from './drivers/drivers.module';
import { PrismaModule } from './prisma/prisma.module';
import { RidesModule } from './rides/rides.module';
import { ServiceZonesModule } from './service-zones/service-zones.module';
import { VehiclesModule } from './vehicles/vehicles.module';

@Module({
  imports: [
    PrismaModule,
    ServiceZonesModule,
    DriversModule,
    VehiclesModule,
    DriverLocationsModule,
    RidesModule,
  ],
})
export class AppModule {}
