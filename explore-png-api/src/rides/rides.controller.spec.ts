import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { RiderJwtAuthGuard } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import { RidesController } from './rides.controller';

describe('RidesController authorization mapping', () => {
  function guardsFor(methodName: keyof RidesController): unknown[] {
    const method = RidesController.prototype[methodName];

    const metadata = Reflect.getMetadata(GUARDS_METADATA, method) as unknown;

    return Array.isArray(metadata) ? metadata : [];
  }

  it('protects fare quoting and ride creation with Rider authentication', () => {
    expect(guardsFor('quote')).toContain(RiderJwtAuthGuard);
    expect(guardsFor('create')).toContain(RiderJwtAuthGuard);
  });

  it('protects Rider-owned reads with Rider authentication', () => {
    expect(guardsFor('findMyRide')).toContain(RiderJwtAuthGuard);
    expect(guardsFor('getMyCurrentLocation')).toContain(RiderJwtAuthGuard);
    expect(guardsFor('getMySettlement')).toContain(RiderJwtAuthGuard);
  });

  it('protects Driver-owned operations with Driver authentication', () => {
    expect(guardsFor('findMyActiveDriverRide')).toContain(DriverJwtAuthGuard);
    expect(guardsFor('updateMyRideStatus')).toContain(DriverJwtAuthGuard);
  });

  it('keeps fleet-wide ride listing Admin-only', () => {
    expect(guardsFor('findAll')).toContain(AdminJwtAuthGuard);
  });

  it('keeps assignment and settlement payment Admin-only', () => {
    expect(guardsFor('assignDriver')).toContain(AdminJwtAuthGuard);
    expect(guardsFor('markSettlementPaid')).toContain(AdminJwtAuthGuard);
  });

  it('keeps legacy ride details and status controls Admin-only', () => {
    expect(guardsFor('findOne')).toContain(AdminJwtAuthGuard);
    expect(guardsFor('getCurrentLocation')).toContain(AdminJwtAuthGuard);
    expect(guardsFor('getSettlement')).toContain(AdminJwtAuthGuard);
    expect(guardsFor('updateStatus')).toContain(AdminJwtAuthGuard);
  });
});
