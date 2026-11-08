import type { Server } from 'node:http';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RideStatus, RideType } from '@prisma/client';
import request from 'supertest';
import { AdminJwtAuthGuard } from '../src/admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../src/driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { RiderJwtAuthGuard } from '../src/rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import { RidesController } from '../src/rides/rides.controller';
import { RidesService } from '../src/rides/rides.service';

describe('Rides HTTP API (non-destructive e2e)', () => {
  let app: INestApplication;

  const ridesServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    getSettlement: jest.fn(),
    markSettlementPaid: jest.fn(),
    assignDriver: jest.fn(),
    updateStatus: jest.fn(),
  };

  const validRideType = Object.values(RideType)[0];
  const validRideStatus = Object.values(RideStatus)[0];
  const authenticatedRider = {
    id: 'rider-test-1',
  };
  const authenticatedDriver = {
    id: 'driver-test-1',
  };

  const riderJwtAuthGuardMock = {
    canActivate: jest.fn((context: ExecutionContext) => {
      const httpRequest = context.switchToHttp().getRequest<{
        rider?: {
          id: string;
        };
      }>();

      httpRequest.rider = authenticatedRider;

      return true;
    }),
  };

  const driverJwtAuthGuardMock = {
    canActivate: jest.fn((context: ExecutionContext) => {
      const httpRequest = context.switchToHttp().getRequest<{
        driver?: {
          id: string;
        };
      }>();

      httpRequest.driver = authenticatedDriver;

      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RidesController],
      providers: [
        {
          provide: RidesService,
          useValue: ridesServiceMock,
        },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
      .overrideGuard(RiderJwtAuthGuard)
      .useValue(riderJwtAuthGuardMock)
      .overrideGuard(DriverJwtAuthGuard)
      .useValue(driverJwtAuthGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /rides returns rides without accessing the database', async () => {
    const rides = [
      {
        id: 'ride-test-1',
        rideType: validRideType,
        pickupLabel: 'Vision City',
        status: validRideStatus,
      },
    ];

    ridesServiceMock.findAll.mockResolvedValue(rides);

    await request(app.getHttpServer() as Server)
      .get('/rides')
      .expect(200)
      .expect(rides);

    expect(ridesServiceMock.findAll).toHaveBeenCalledWith({
      status: undefined,
      locationId: undefined,
      serviceZoneId: undefined,
      driverId: undefined,
    });
  });

  it('GET /rides forwards location and service-zone filters', async () => {
    ridesServiceMock.findAll.mockResolvedValue([]);

    await request(app.getHttpServer() as Server)
      .get('/rides')
      .query({
        status: validRideStatus,
        locationId: 'lae',
        serviceZoneId: 'lae-eriku',
        driverId: 'driver-test-1',
      })
      .expect(200)
      .expect([]);

    expect(ridesServiceMock.findAll).toHaveBeenCalledWith({
      status: validRideStatus,
      locationId: 'lae',
      serviceZoneId: 'lae-eriku',
      driverId: 'driver-test-1',
    });
  });

  it('GET /rides/:id returns a mocked ride', async () => {
    const ride = {
      id: 'ride-test-1',
      rideType: validRideType,
      pickupLabel: 'Kagamuga Airport',
      status: validRideStatus,
    };

    ridesServiceMock.findOne.mockResolvedValue(ride);

    await request(app.getHttpServer() as Server)
      .get('/rides/ride-test-1')
      .expect(200)
      .expect(ride);

    expect(ridesServiceMock.findOne).toHaveBeenCalledWith('ride-test-1');
  });

  it('POST /rides rejects missing required fields', async () => {
    await request(app.getHttpServer() as Server)
      .post('/rides')
      .send({})
      .expect(400);

    expect(ridesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /rides rejects unknown properties', async () => {
    await request(app.getHttpServer() as Server)
      .post('/rides')
      .send({
        rideType: validRideType,
        pickupLabel: 'Kokopo Town',
        unauthorizedField: 'must be rejected',
      })
      .expect(400);

    expect(ridesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /rides accepts a valid request and transforms coordinates', async () => {
    const createdRide = {
      id: 'ride-test-2',
      rideType: validRideType,
      pickupLabel: 'Lae Airport',
      pickupLatitude: -6.5698,
      pickupLongitude: 146.7262,
    };

    ridesServiceMock.create.mockResolvedValue(createdRide);

    await request(app.getHttpServer() as Server)
      .post('/rides')
      .send({
        rideType: validRideType,
        pickupLabel: 'Lae Airport',
        pickupLatitude: '-6.5698',
        pickupLongitude: '146.7262',
      })
      .expect(201)
      .expect(createdRide);

    expect(ridesServiceMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rideType: validRideType,
        pickupLabel: 'Lae Airport',
        pickupLatitude: -6.5698,
        pickupLongitude: 146.7262,
      }),
      authenticatedRider,
    );
  });

  it('PATCH /rides/:id/assign-driver rejects an empty driver ID', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/rides/ride-test-1/assign-driver')
      .send({
        driverId: '',
      })
      .expect(400);

    expect(ridesServiceMock.assignDriver).not.toHaveBeenCalled();
  });

  it('PATCH /rides/:id/status rejects an invalid ride status', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/rides/ride-test-1/status')
      .send({
        status: 'NOT_A_REAL_STATUS',
      })
      .expect(400);

    expect(ridesServiceMock.updateStatus).not.toHaveBeenCalled();
  });
});
