import type { Server } from 'node:http';
import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdminJwtAuthGuard } from '../src/admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import request from 'supertest';
import { DriverLocationsController } from '../src/driver-locations/driver-locations.controller';
import { DriverLocationsService } from '../src/driver-locations/driver-locations.service';
import { DriverJwtAuthGuard } from '../src/driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';

describe('Driver Locations HTTP API (non-destructive e2e)', () => {
  let app: INestApplication;

  const driverLocationsServiceMock = {
    history: jest.fn(),
    upsert: jest.fn(),
  };

  const authenticatedDriverId = 'driver-1';
  const testTokenPrefix = 'Bearer test-driver-token:';

  const adminJwtAuthGuardMock = {
    canActivate: jest.fn(() => true),
  };
  const driverJwtAuthGuardMock = {
    canActivate: jest.fn((context: ExecutionContext) => {
      const httpRequest = context.switchToHttp().getRequest<{
        headers: {
          authorization?: string;
        };
        driver?: {
          id: string;
        };
      }>();

      const authorization = httpRequest.headers.authorization;

      if (!authorization?.startsWith(testTokenPrefix)) {
        throw new UnauthorizedException('Driver authentication is required');
      }

      const driverId = authorization.slice(testTokenPrefix.length);

      if (!driverId) {
        throw new UnauthorizedException('Driver authentication is required');
      }

      httpRequest.driver = {
        id: driverId,
      };

      return true;
    }),
  };

  const authorizationFor = (driverId: string) =>
    `${testTokenPrefix}${driverId}`;

  const authenticatedGet = (path: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('Authorization', authorizationFor(authenticatedDriverId));

  const authenticatedPost = (path: string, driverId = authenticatedDriverId) =>
    request(app.getHttpServer() as Server)
      .post(path)
      .set('Authorization', authorizationFor(driverId));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DriverLocationsController],
      providers: [
        {
          provide: DriverLocationsService,
          useValue: driverLocationsServiceMock,
        },
        {
          provide: AdminJwtAuthGuard,
          useValue: adminJwtAuthGuardMock,
        },
        {
          provide: DriverJwtAuthGuard,
          useValue: driverJwtAuthGuardMock,
        },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue(adminJwtAuthGuardMock)
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

  it('rejects requests without driver location credentials', async () => {
    await request(app.getHttpServer() as Server)
      .get('/driver-locations/history')
      .query({
        rideId: 'ride-1',
      })
      .expect(401);

    expect(driverLocationsServiceMock.history).not.toHaveBeenCalled();
  });

  it('rejects an invalid Driver authentication token', async () => {
    await request(app.getHttpServer() as Server)
      .get('/driver-locations/history')
      .set('Authorization', 'Bearer invalid-driver-location-api-key')
      .query({
        rideId: 'ride-1',
      })
      .expect(401);

    expect(driverLocationsServiceMock.history).not.toHaveBeenCalled();
  });

  it('rejects credentials without a driver identity', async () => {
    await request(app.getHttpServer() as Server)
      .post('/driver-locations/upsert')
      .set('Authorization', testTokenPrefix)
      .send({
        latitude: -9.4438,
        longitude: 147.2204,
      })
      .expect(401);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });
  it('GET /driver-locations/history accepts a valid date range and limit', async () => {
    const history = [
      {
        id: 'history-1',
        rideId: 'ride-1',
        driverId: 'driver-1',
        latitude: -9.4438,
        longitude: 147.2204,
        recordedAt: '2026-07-05T01:30:00.000Z',
      },
    ];

    const response = {
      items: history,
      nextCursor: null,
    };

    driverLocationsServiceMock.history.mockResolvedValue(response);

    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        from: '2026-07-05T01:00:00.000Z',
        to: '2026-07-05T02:00:00.000Z',
        limit: '100',
      })
      .expect(200)
      .expect(response);

    expect(driverLocationsServiceMock.history).toHaveBeenCalledWith(
      {
        rideId: 'ride-1',
        from: '2026-07-05T01:00:00.000Z',
        to: '2026-07-05T02:00:00.000Z',
        limit: 100,
      },
      authenticatedDriverId,
    );
  });

  it('GET /driver-locations/history uses the default limit', async () => {
    const response = {
      items: [],
      nextCursor: null,
    };

    driverLocationsServiceMock.history.mockResolvedValue(response);

    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
      })
      .expect(200)
      .expect(response);

    expect(driverLocationsServiceMock.history).toHaveBeenCalledWith(
      {
        rideId: 'ride-1',
        limit: 500,
      },
      authenticatedDriverId,
    );
  });

  it('GET /driver-locations/history forwards an opaque cursor', async () => {
    const response = {
      items: [],
      nextCursor: null,
    };

    driverLocationsServiceMock.history.mockResolvedValue(response);

    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        cursor: 'opaque-cursor-value',
        limit: '50',
      })
      .expect(200)
      .expect(response);

    expect(driverLocationsServiceMock.history).toHaveBeenCalledWith(
      {
        rideId: 'ride-1',
        cursor: 'opaque-cursor-value',
        limit: 50,
      },
      authenticatedDriverId,
    );
  });
  it('GET /driver-locations/history rejects a missing rideId', async () => {
    await authenticatedGet('/driver-locations/history').expect(400);

    expect(driverLocationsServiceMock.history).not.toHaveBeenCalled();
  });

  it('GET /driver-locations/history rejects invalid timestamps', async () => {
    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        from: 'not-a-date',
      })
      .expect(400);

    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        to: 'not-a-date',
      })
      .expect(400);

    expect(driverLocationsServiceMock.history).not.toHaveBeenCalled();
  });

  it('GET /driver-locations/history rejects invalid limits', async () => {
    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        limit: '0',
      })
      .expect(400);

    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        limit: '1001',
      })
      .expect(400);

    await authenticatedGet('/driver-locations/history')
      .query({
        rideId: 'ride-1',
        limit: '10.5',
      })
      .expect(400);

    expect(driverLocationsServiceMock.history).not.toHaveBeenCalled();
  });
  it('POST /driver-locations/upsert rejects missing required fields', async () => {
    await authenticatedPost('/driver-locations/upsert').send({}).expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('POST /driver-locations/upsert rejects latitude above 90', async () => {
    await authenticatedPost('/driver-locations/upsert')
      .send({
        latitude: 91,
        longitude: 147.2204,
      })
      .expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('POST /driver-locations/upsert rejects latitude below -90', async () => {
    await authenticatedPost('/driver-locations/upsert')
      .send({
        latitude: -91,
        longitude: 147.2204,
      })
      .expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('POST /driver-locations/upsert rejects longitude above 180', async () => {
    await authenticatedPost('/driver-locations/upsert')
      .send({
        latitude: -9.4438,
        longitude: 181,
      })
      .expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('POST /driver-locations/upsert rejects longitude below -180', async () => {
    await authenticatedPost('/driver-locations/upsert')
      .send({
        latitude: -9.4438,
        longitude: -181,
      })
      .expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('POST /driver-locations/upsert rejects unknown properties', async () => {
    await authenticatedPost('/driver-locations/upsert')
      .send({
        latitude: -9.4438,
        longitude: 147.2204,
        hiddenGpsOverride: true,
      })
      .expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('POST /driver-locations/upsert accepts a valid Port Moresby GPS update', async () => {
    const updatedLocation = {
      id: 'location-test-1',
      driverId: 'driver-pom-1',
      latitude: -9.4438,
      longitude: 147.2204,
      heading: 90,
      speed: 35,
      accuracy: 8,
    };

    driverLocationsServiceMock.upsert.mockResolvedValue(updatedLocation);

    await authenticatedPost('/driver-locations/upsert', 'driver-pom-1')
      .send({
        latitude: -9.4438,
        longitude: 147.2204,
        heading: 90,
        speed: 35,
        accuracy: 8,
      })
      .expect(201)
      .expect(updatedLocation);

    expect(driverLocationsServiceMock.upsert).toHaveBeenCalledWith(
      {
        driverId: 'driver-pom-1',
        latitude: -9.4438,
        longitude: 147.2204,
        heading: 90,
        speed: 35,
        accuracy: 8,
      },
      'driver-pom-1',
    );
  });

  it('POST /driver-locations/upsert accepts a valid Lae GPS update', async () => {
    const updatedLocation = {
      id: 'location-test-2',
      driverId: 'driver-lae-1',
      latitude: -6.7287,
      longitude: 147,
    };

    driverLocationsServiceMock.upsert.mockResolvedValue(updatedLocation);

    await authenticatedPost('/driver-locations/upsert', 'driver-lae-1')
      .send({
        latitude: -6.7287,
        longitude: 147,
      })
      .expect(201)
      .expect(updatedLocation);

    expect(driverLocationsServiceMock.upsert).toHaveBeenCalledWith(
      {
        driverId: 'driver-lae-1',
        latitude: -6.7287,
        longitude: 147,
      },
      'driver-lae-1',
    );
  });

  it('POST /driver-locations/upsert rejects string coordinates', async () => {
    await authenticatedPost('/driver-locations/upsert')
      .send({
        latitude: '-9.4438',
        longitude: '147.2204',
      })
      .expect(400);

    expect(driverLocationsServiceMock.upsert).not.toHaveBeenCalled();
  });
});
