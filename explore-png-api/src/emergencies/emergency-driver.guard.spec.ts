import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmergencyDriverGuard } from './emergency-driver.guard';

const testSecret = 'unit-test-only-not-a-production-key';
function context(token?: string) {
  const req: {
    header: (name: string) => string | undefined;
    driver?: { id: string };
  } = {
    header: (name) =>
      name === 'authorization' && token ? `Bearer ${token}` : undefined,
  };
  return {
    req,
    ctx: {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}
describe('EmergencyDriverGuard with real JWT verification', () => {
  const jwt = new JwtService();
  const database = { driver: { findUnique: jest.fn() } };
  const config = { getOrThrow: () => testSecret };
  const guard = new EmergencyDriverGuard(
    jwt,
    database as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  const driver = {
    id: 'driver-1',
    fullName: 'CI driver',
    phone: 'test-only',
    email: null,
    status: DriverStatus.APPROVED,
    isAuthActive: true,
    tokenVersion: 3,
  };
  const token = (overrides = {}) =>
    jwt.sign(
      {
        sub: driver.id,
        tokenType: 'driver-access',
        tokenVersion: 3,
        ...overrides,
      },
      { secret: testSecret, expiresIn: 60 },
    );
  beforeEach(() => {
    jest.clearAllMocks();
    database.driver.findUnique.mockResolvedValue(driver);
  });

  it('accepts an active approved driver and attaches only public identity fields', async () => {
    const { ctx, req } = context(token());
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.driver).toEqual({
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      email: null,
    });
  });
  it('permits emergency access for a suspended driver with active unrevoked credentials', async () => {
    database.driver.findUnique.mockResolvedValue({
      ...driver,
      status: DriverStatus.SUSPENDED,
    });
    await expect(guard.canActivate(context(token()).ctx)).resolves.toBe(true);
  });
  it('rejects disabled, revoked, inactive and pending accounts', async () => {
    for (const changed of [
      { isAuthActive: false },
      { tokenVersion: 4 },
      { status: DriverStatus.INACTIVE },
      { status: DriverStatus.PENDING },
    ]) {
      database.driver.findUnique.mockResolvedValue({ ...driver, ...changed });
      await expect(guard.canActivate(context(token()).ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });
  it('rejects missing, forged, expired and wrong-role tokens before looking up an account', async () => {
    const expired = jwt.sign(
      { sub: driver.id, tokenType: 'driver-access', tokenVersion: 3 },
      { secret: testSecret, expiresIn: -1 },
    );
    const forged = jwt.sign(
      { sub: driver.id, tokenType: 'driver-access', tokenVersion: 3 },
      { secret: 'different-unit-test-key' },
    );
    for (const value of [
      undefined,
      'invalid',
      expired,
      forged,
      token({ tokenType: 'admin-access' }),
      token({ tokenVersion: '3' }),
    ]) {
      await expect(guard.canActivate(context(value).ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    }
    expect(database.driver.findUnique).not.toHaveBeenCalled();
  });
  it('rejects tokens for deleted accounts', async () => {
    database.driver.findUnique.mockResolvedValue(null);
    await expect(guard.canActivate(context(token()).ctx)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
