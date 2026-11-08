import type { Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AdminRole } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { DriverAuthController } from '../src/driver-auth/driver-auth.controller';
import { DriverAuthService } from '../src/driver-auth/driver-auth.service';
import { DriversController } from '../src/drivers/drivers.controller';
import { DriversService } from '../src/drivers/drivers.service';
import { VehiclesController } from '../src/vehicles/vehicles.controller';
import { VehiclesService } from '../src/vehicles/vehicles.service';
import { ServiceZonesController } from '../src/service-zones/service-zones.controller';
import { ServiceZonesService } from '../src/service-zones/service-zones.service';
import { RidesController } from '../src/rides/rides.controller';
import { RidesService } from '../src/rides/rides.service';

type Route = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
};

describe('Administrator permission split', () => {
  const secret = 'fictional-admin-permission-test-secret';
  const jwt = new JwtService();
  const operation = jest.fn();
  const prisma = { adminAccount: { findUnique: jest.fn() } };

  let app: INestApplication;
  let server: Server;

  const restricted: Route[] = [
    { method: 'patch', path: '/driver-auth/driver-test/credentials' },
    { method: 'post', path: '/drivers' },
    { method: 'patch', path: '/drivers/driver-test/status' },
    { method: 'patch', path: '/drivers/driver-test' },
    { method: 'delete', path: '/drivers/driver-test' },
    { method: 'post', path: '/vehicles' },
    { method: 'patch', path: '/vehicles/vehicle-test/driver' },
    { method: 'patch', path: '/vehicles/vehicle-test/status' },
    { method: 'patch', path: '/vehicles/vehicle-test' },
    { method: 'delete', path: '/vehicles/vehicle-test' },
    { method: 'post', path: '/service-zones' },
    { method: 'patch', path: '/service-zones/zone-test' },
    { method: 'delete', path: '/service-zones/zone-test' },
    { method: 'patch', path: '/rides/ride-test/settlement/paid' },
  ];

  const shared: Route[] = [
    { method: 'get', path: '/drivers' },
    { method: 'get', path: '/drivers/nearby' },
    { method: 'get', path: '/drivers/driver-test' },
    { method: 'get', path: '/vehicles' },
    { method: 'get', path: '/vehicles/vehicle-test' },
    { method: 'get', path: '/rides' },
    { method: 'get', path: '/rides/driver/driver-test/active' },
    { method: 'get', path: '/rides/ride-test' },
    { method: 'get', path: '/rides/ride-test/location' },
    { method: 'get', path: '/rides/ride-test/settlement' },
    { method: 'patch', path: '/rides/ride-test/assign-driver' },
    { method: 'patch', path: '/rides/ride-test/status' },
  ];

  function serviceMethods(names: string[]) {
    return Object.fromEntries(names.map((name) => [name, operation]));
  }

  function account(role: AdminRole) {
    return {
      id: 'admin-test',
      email: 'admin@example.test',
      fullName: 'Fictional Administrator',
      role,
      isActive: true,
      tokenVersion: 1,
    };
  }

  function token(
    role: AdminRole = AdminRole.SUPER_ADMIN,
    tokenType = 'admin-access',
  ) {
    return jwt.sign(
      { sub: 'admin-test', role, tokenType, tokenVersion: 1 },
      { secret, expiresIn: '5m' },
    );
  }

  function call(route: Route) {
    return request(server)[route.method](route.path).send({});
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        DriverAuthController,
        DriversController,
        VehiclesController,
        ServiceZonesController,
        RidesController,
      ],
      providers: [
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            ADMIN_JWT_SECRET: secret,
            DRIVER_JWT_SECRET: secret,
            RIDER_JWT_SECRET: secret,
          }),
        },
        { provide: PrismaService, useValue: prisma },
        {
          provide: DriverAuthService,
          useValue: serviceMethods(['setCredentials']),
        },
        {
          provide: DriversService,
          useValue: serviceMethods([
            'create',
            'findAll',
            'findNearby',
            'findOne',
            'updateStatus',
            'update',
            'remove',
          ]),
        },
        {
          provide: VehiclesService,
          useValue: serviceMethods([
            'create',
            'findAll',
            'findOne',
            'updateDriverAssignment',
            'updateStatus',
            'update',
            'remove',
          ]),
        },
        {
          provide: ServiceZonesService,
          useValue: serviceMethods([
            'create',
            'findAll',
            'findOne',
            'update',
            'remove',
          ]),
        },
        {
          provide: RidesService,
          useValue: serviceMethods([
            'findAll',
            'findActiveDriverRide',
            'findOne',
            'getCurrentLocation',
            'getSettlement',
            'assignDriver',
            'updateStatus',
            'markSettlementPaid',
          ]),
        },
      ],
    })
      // Login throttling is outside this permission test.
      // The administrator JWT guard is NOT overridden.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    // Intentionally test authorization independently of DTO validation.
    // Existing endpoint tests cover request validation.
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    operation.mockResolvedValue({ ok: true });
    prisma.adminAccount.findUnique.mockResolvedValue(
      account(AdminRole.DISPATCHER),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe.each(restricted)('$method $path', (route) => {
    it('requires authentication', async () => {
      await call(route).expect(401);
      expect(operation).not.toHaveBeenCalled();
    });

    it('rejects a dispatcher even with a super-admin claim in the token', async () => {
      await call(route).set('Authorization', `Bearer ${token()}`).expect(403);
      expect(operation).not.toHaveBeenCalled();
    });

    it('allows the current database super administrator', async () => {
      prisma.adminAccount.findUnique.mockResolvedValue(
        account(AdminRole.SUPER_ADMIN),
      );

      await call(route)
        .set('Authorization', `Bearer ${token(AdminRole.DISPATCHER)}`)
        .expect(route.method === 'post' ? 201 : 200)
        .expect({ ok: true });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it.each(['rider-access', 'driver-access'])(
      'rejects a %s token',
      async (type) => {
        await call(route)
          .set('Authorization', `Bearer ${token(AdminRole.SUPER_ADMIN, type)}`)
          .expect(401);
        expect(operation).not.toHaveBeenCalled();
      },
    );

    it('rejects an inactive super administrator', async () => {
      prisma.adminAccount.findUnique.mockResolvedValue({
        ...account(AdminRole.SUPER_ADMIN),
        isActive: false,
      });
      await call(route).set('Authorization', `Bearer ${token()}`).expect(401);
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe.each(shared)('$method $path remains shared', (route) => {
    it.each([AdminRole.DISPATCHER, AdminRole.SUPER_ADMIN])(
      'allows %s',
      async (role) => {
        prisma.adminAccount.findUnique.mockResolvedValue(account(role));
        await call(route)
          .set('Authorization', `Bearer ${token(role)}`)
          .expect(200)
          .expect({ ok: true });
        expect(operation).toHaveBeenCalledTimes(1);
      },
    );
  });
});
