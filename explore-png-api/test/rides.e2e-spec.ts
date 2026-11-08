import type { Server } from 'node:http';
import {
  ExecutionContext,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtAuthGuard } from '../src/admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../src/driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { RiderJwtAuthGuard } from '../src/rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import { RidesController } from '../src/rides/rides.controller';
import { RidesService } from '../src/rides/rides.service';

describe('Rides current location HTTP API (non-destructive e2e)', () => {
  let app: INestApplication;

  const ridesServiceMock = {
    getCurrentLocation: jest.fn(),
  };

  const testAdminAuthorization = 'Bearer test-admin-token';

  const adminJwtAuthGuardMock = {
    canActivate: jest.fn((context: ExecutionContext) => {
      const httpRequest = context.switchToHttp().getRequest<{
        headers: {
          authorization?: string;
        };
      }>();

      if (httpRequest.headers.authorization !== testAdminAuthorization) {
        throw new UnauthorizedException('Admin authentication is required');
      }

      return true;
    }),
  };

  const unrelatedGuardMock = {
    canActivate: jest.fn(() => true),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RidesController],
      providers: [
        {
          provide: AdminJwtAuthGuard,
          useValue: adminJwtAuthGuardMock,
        },
        {
          provide: RidesService,
          useValue: ridesServiceMock,
        },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue(adminJwtAuthGuardMock)
      .overrideGuard(RiderJwtAuthGuard)
      .useValue(unrelatedGuardMock)
      .overrideGuard(DriverJwtAuthGuard)
      .useValue(unrelatedGuardMock)
      .compile();

    app = moduleFixture.createNestApplication();
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

  it('GET /rides/:id/location rejects a request without admin authentication', async () => {
    await request(app.getHttpServer() as Server)
      .get('/rides/ride-1/location')
      .expect(401)
      .expect({
        message: 'Admin authentication is required',
        error: 'Unauthorized',
        statusCode: 401,
      });

    expect(ridesServiceMock.getCurrentLocation).not.toHaveBeenCalled();
  });

  it('GET /rides/:id/location returns the current driver location', async () => {
    const response = {
      rideId: 'ride-1',
      driverId: 'driver-1',
      latitude: -9.4438,
      longitude: 147.2204,
      accuracy: 8,
      heading: 90,
      speed: 35,
      recordedAt: '2026-07-05T01:30:00.000Z',
      isFresh: true,
    };

    ridesServiceMock.getCurrentLocation.mockResolvedValue(response);

    await request(app.getHttpServer() as Server)
      .get('/rides/ride-1/location')
      .set('Authorization', testAdminAuthorization)
      .expect(200)
      .expect(response);

    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledWith('ride-1');
  });

  it('GET /rides/:id/location returns 404 when the ride does not exist', async () => {
    ridesServiceMock.getCurrentLocation.mockRejectedValue(
      new NotFoundException('Ride not found'),
    );

    const response = await request(app.getHttpServer() as Server)
      .get('/rides/ride-missing/location')
      .set('Authorization', testAdminAuthorization)
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'Ride not found',
      error: 'Not Found',
    });

    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledWith(
      'ride-missing',
    );
  });

  it('GET /rides/:id/location returns 404 when no driver is assigned', async () => {
    ridesServiceMock.getCurrentLocation.mockRejectedValue(
      new NotFoundException('Ride has no assigned driver'),
    );

    const response = await request(app.getHttpServer() as Server)
      .get('/rides/ride-1/location')
      .set('Authorization', testAdminAuthorization)
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'Ride has no assigned driver',
      error: 'Not Found',
    });

    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledWith('ride-1');
  });

  it('GET /rides/:id/location returns 404 when the driver has no location', async () => {
    ridesServiceMock.getCurrentLocation.mockRejectedValue(
      new NotFoundException('Driver location not found'),
    );

    const response = await request(app.getHttpServer() as Server)
      .get('/rides/ride-1/location')
      .set('Authorization', testAdminAuthorization)
      .expect(404);

    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'Driver location not found',
      error: 'Not Found',
    });

    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledTimes(1);
    expect(ridesServiceMock.getCurrentLocation).toHaveBeenCalledWith('ride-1');
  });
});
