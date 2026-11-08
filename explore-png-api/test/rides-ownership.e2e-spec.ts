import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DriverStatus, RideStatus } from '@prisma/client';
import { Server } from 'http';
import request from 'supertest';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RidesController } from '../src/rides/rides.controller';
import { RidesService } from '../src/rides/rides.service';
import { RoutingService } from '../src/routing/routing.service';

describe('Ride HTTP ownership with real JWT guards', () => {
  // Deliberately share a fictional key to verify token-type checks too.
  const secret = 'fictional-ownership-test-key-never-used-in-production';
  const jwt = new JwtService();

  const rides = ['a', 'b'].map((suffix) => ({
    id: `ride-${suffix}`,
    riderId: `rider-${suffix}`,
    driverId: `driver-${suffix}`,
    vehicleId: `vehicle-${suffix}`,
    status: RideStatus.ACCEPTED,
    estimatedFare: 50,
    finalFare: null,
  }));

  const riders = ['a', 'b'].map((suffix) => ({
    id: `rider-${suffix}`,
    fullName: `Fictional Rider ${suffix}`,
    phone: `test-rider-${suffix}`,
    email: null,
    isActive: true,
    tokenVersion: 0,
  }));

  const drivers = ['a', 'b'].map((suffix) => ({
    id: `driver-${suffix}`,
    fullName: `Fictional Driver ${suffix}`,
    phone: `test-driver-${suffix}`,
    email: null,
    status: DriverStatus.APPROVED,
    isAuthActive: true,
    tokenVersion: 0,
  }));

  const prisma = {
    riderAccount: { findUnique: jest.fn() },
    driver: { findUnique: jest.fn(), updateMany: jest.fn() },
    adminAccount: { findUnique: jest.fn() },
    ride: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    rideAuditEvent: { create: jest.fn() },
    rideSettlement: { upsert: jest.fn() },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  let app: INestApplication;
  let server: Server;
  let service: RidesService;

  function token(subject: string, tokenType: string) {
    return jwt.sign(
      { sub: subject, tokenType, tokenVersion: 0 },
      { secret, expiresIn: '5m' },
    );
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [RidesController],
      providers: [
        RidesService,
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            RIDER_JWT_SECRET: secret,
            DRIVER_JWT_SECRET: secret,
            ADMIN_JWT_SECRET: secret,
          }),
        },
        { provide: PrismaService, useValue: prisma },
        { provide: RoutingService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    service = module.get(RidesService);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Simulate the lock call; real database locking is not exercised here.
    prisma.$executeRaw.mockResolvedValue(0);
    prisma.ride.updateMany.mockResolvedValue({ count: 1 });
    prisma.driver.updateMany.mockResolvedValue({ count: 1 });

    prisma.riderAccount.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(riders.find((row) => row.id === where.id) ?? null),
    );
    prisma.driver.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(drivers.find((row) => row.id === where.id) ?? null),
    );
    prisma.adminAccount.findUnique.mockResolvedValue(null);

    prisma.ride.findFirst.mockImplementation(
      ({
        where,
      }: {
        where: { id?: string; riderId?: string; driverId?: string };
      }) =>
        Promise.resolve(
          rides.find(
            (row) =>
              (where.id === undefined || row.id === where.id) &&
              (where.riderId === undefined || row.riderId === where.riderId) &&
              (where.driverId === undefined || row.driverId === where.driverId),
          ) ?? null,
        ),
    );
    prisma.ride.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(rides.find((row) => row.id === where.id) ?? null),
    );
    prisma.ride.update.mockResolvedValue(rides[0]);
    prisma.rideAuditEvent.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['', '/location', '/settlement'])(
    'rejects unauthenticated rider read %s',
    async (suffix) => {
      await request(server).get(`/rides/me/ride-a${suffix}`).expect(401);
      expect(prisma.ride.findFirst).not.toHaveBeenCalled();
      expect(prisma.ride.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['', '/location', '/settlement'])(
    'rejects another rider read %s before loading private details',
    async (suffix) => {
      await request(server)
        .get(`/rides/me/ride-a${suffix}`)
        .set('Authorization', `Bearer ${token('rider-b', 'rider-access')}`)
        .expect(404);

      expect(prisma.ride.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ride-a', riderId: 'rider-b' },
        }),
      );
      expect(prisma.ride.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['', '/location', '/settlement'])(
    'rejects a driver token on a rider endpoint %s',
    async (suffix) => {
      await request(server)
        .get(`/rides/me/ride-a${suffix}`)
        .set('Authorization', `Bearer ${token('driver-a', 'driver-access')}`)
        .expect(401);

      expect(prisma.ride.findFirst).not.toHaveBeenCalled();
    },
  );

  it.each(['a', 'b'])(
    'allows rider %s to read their own ride',
    async (suffix) => {
      await request(server)
        .get(`/rides/me/ride-${suffix}`)
        .set(
          'Authorization',
          `Bearer ${token(`rider-${suffix}`, 'rider-access')}`,
        )
        .expect(200)
        .expect((response: { body: unknown }) => {
          const expectedRide = rides.find(
            (ride) => ride.id === `ride-${suffix}`,
          );
          if (!expectedRide) {
            throw new Error('Expected ride fixture is missing');
          }
          expect(response.body).toEqual(expectedRide);
        });
    },
  );

  it('does not accept a rider identity supplied in the query string', async () => {
    await request(server)
      .get('/rides/me/ride-a?riderId=rider-a')
      .set('Authorization', `Bearer ${token('rider-b', 'rider-access')}`)
      .expect(404);
  });

  it('rejects a driver changing another driver ride before any business mutation', async () => {
    await request(server)
      .patch('/rides/driver/me/ride-a/status')
      .set('Authorization', `Bearer ${token('driver-b', 'driver-access')}`)
      .send({ status: RideStatus.DRIVER_ARRIVED })
      .expect(404);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.ride.update).not.toHaveBeenCalled();
    expect(prisma.ride.updateMany).not.toHaveBeenCalled();
    expect(prisma.driver.updateMany).not.toHaveBeenCalled();
    expect(prisma.rideAuditEvent.create).not.toHaveBeenCalled();
    expect(prisma.rideSettlement.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'missing authentication'],
    ['rider-access', 'rider token'],
  ])('rejects driver status update with %s (%s)', async (tokenType) => {
    const call = request(server)
      .patch('/rides/driver/me/ride-a/status')
      .send({ status: RideStatus.DRIVER_ARRIVED });

    if (tokenType) {
      call.set('Authorization', `Bearer ${token('rider-a', tokenType)}`);
    }

    await call.expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows the assigned driver to reach the status transaction', async () => {
    await request(server)
      .patch('/rides/driver/me/ride-a/status')
      .set('Authorization', `Bearer ${token('driver-a', 'driver-access')}`)
      .send({ status: RideStatus.DRIVER_ARRIVED })
      .expect(200);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.ride.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.ride.update).not.toHaveBeenCalled();
    expect(prisma.ride.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'ride-a',
          status: RideStatus.ACCEPTED,
          driverId: 'driver-a',
        },
        data: expect.objectContaining({
          status: RideStatus.DRIVER_ARRIVED,
        }) as unknown,
      }),
    );
  });

  it('rejects a driverId supplied in the status body', async () => {
    await request(server)
      .patch('/rides/driver/me/ride-a/status')
      .set('Authorization', `Bearer ${token('driver-b', 'driver-access')}`)
      .send({ status: RideStatus.DRIVER_ARRIVED, driverId: 'driver-a' })
      .expect(400);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the authenticated driver for the active-ride lookup', async () => {
    await request(server)
      .get('/rides/driver/me/active?driverId=driver-a')
      .set('Authorization', `Bearer ${token('driver-b', 'driver-access')}`)
      .expect(200)
      .expect(rides[1]);

    expect(prisma.ride.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ driverId: 'driver-b' }) as unknown,
      }),
    );
  });

  it.each([
    ['rider-a', 'rider-access'],
    ['driver-a', 'driver-access'],
  ])(
    'rejects %s on the administrator ride-read route',
    async (subject, type) => {
      const lookup = jest.spyOn(service, 'findOne');

      await request(server)
        .get('/rides/ride-a')
        .set('Authorization', `Bearer ${token(subject, type)}`)
        .expect(401);

      expect(lookup).not.toHaveBeenCalled();
    },
  );
});
