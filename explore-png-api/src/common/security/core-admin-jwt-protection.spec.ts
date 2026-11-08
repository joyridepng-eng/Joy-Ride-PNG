import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminJwtAuthGuard } from '../../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { TripAuditController } from '../../trip-audit/trip-audit.controller';
import { VehiclesController } from '../../vehicles/vehicles.controller';

describe('Core Admin JWT route protection', () => {
  it('protects the complete Trip Audit controller with Admin JWT', () => {
    const guardMetadata: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      TripAuditController,
    );

    expect(guardMetadata).toEqual([AdminJwtAuthGuard]);
  });

  it('protects the complete Vehicles controller with Admin JWT', () => {
    const guardMetadata: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      VehiclesController,
    );

    expect(guardMetadata).toEqual([AdminJwtAuthGuard]);
  });
});
