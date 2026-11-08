import type { Server } from 'node:http';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtAuthGuard } from '../src/admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../src/driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriversController } from '../src/drivers/drivers.controller';
import { DriversService } from '../src/drivers/drivers.service';

describe('Drivers HTTP API (non-destructive e2e)', () => {
  let app: INestApplication;

  const driversServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findNearby: jest.fn(),
    updateAvailability: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    remove: jest.fn(),
  };

  const authenticatedDriverId = 'driver-test-1';

  const driverJwtAuthGuardMock = {
    canActivate: jest.fn((context: ExecutionContext) => {
      const httpRequest = context.switchToHttp().getRequest<{
        driver?: {
          id: string;
        };
      }>();

      httpRequest.driver = {
        id: authenticatedDriverId,
      };

      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [
        {
          provide: DriversService,
          useValue: driversServiceMock,
        },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
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

  it('GET /drivers returns mocked drivers', async () => {
    const drivers = [
      {
        id: 'driver-pom-1',
        fullName: 'Port Moresby Test Driver',
        phone: '+67570000001',
        isOnline: true,
        isAvailable: true,
      },
    ];

    driversServiceMock.findAll.mockResolvedValue(drivers);

    await request(app.getHttpServer() as Server)
      .get('/drivers')
      .expect(200)
      .expect(drivers);

    expect(driversServiceMock.findAll).toHaveBeenCalledTimes(1);
  });

  it('GET /drivers/:id returns a mocked driver', async () => {
    const driver = {
      id: 'driver-lae-1',
      fullName: 'Lae Test Driver',
      phone: '+67570000002',
    };

    driversServiceMock.findOne.mockResolvedValue(driver);

    await request(app.getHttpServer() as Server)
      .get('/drivers/driver-lae-1')
      .expect(200)
      .expect(driver);

    expect(driversServiceMock.findOne).toHaveBeenCalledWith('driver-lae-1');
  });

  it('POST /drivers rejects missing required fields', async () => {
    await request(app.getHttpServer() as Server)
      .post('/drivers')
      .send({})
      .expect(400);

    expect(driversServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /drivers rejects an invalid email address', async () => {
    await request(app.getHttpServer() as Server)
      .post('/drivers')
      .send({
        fullName: 'Mt. Hagen Test Driver',
        phone: '+67570000003',
        email: 'not-an-email',
      })
      .expect(400);

    expect(driversServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /drivers rejects unknown properties', async () => {
    await request(app.getHttpServer() as Server)
      .post('/drivers')
      .send({
        fullName: 'Kokopo Test Driver',
        phone: '+67570000004',
        secretAdminFlag: true,
      })
      .expect(400);

    expect(driversServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /drivers accepts a valid driver request', async () => {
    const createdDriver = {
      id: 'driver-test-1',
      fullName: 'Test Driver',
      phone: '+67570000005',
      locationId: 'lae',
      serviceZoneId: 'lae-eriku',
    };

    driversServiceMock.create.mockResolvedValue(createdDriver);

    await request(app.getHttpServer() as Server)
      .post('/drivers')
      .send({
        fullName: 'Test Driver',
        phone: '+67570000005',
        locationId: 'lae',
        serviceZoneId: 'lae-eriku',
      })
      .expect(201)
      .expect(createdDriver);

    expect(driversServiceMock.create).toHaveBeenCalledWith({
      fullName: 'Test Driver',
      phone: '+67570000005',
      locationId: 'lae',
      serviceZoneId: 'lae-eriku',
    });
  });

  it('GET /drivers/nearby transforms GPS query values into numbers', async () => {
    driversServiceMock.findNearby.mockResolvedValue([]);

    await request(app.getHttpServer() as Server)
      .get('/drivers/nearby')
      .query({
        latitude: '-6.7287',
        longitude: '147.0000',
        radiusKm: '10',
        locationId: 'lae',
        serviceZoneId: 'lae-eriku',
      })
      .expect(200)
      .expect([]);

    expect(driversServiceMock.findNearby).toHaveBeenCalledWith({
      latitude: -6.7287,
      longitude: 147,
      radiusKm: 10,
      maxLocationAgeSeconds: 120,
      locationId: 'lae',
      serviceZoneId: 'lae-eriku',
    });
  });

  it('GET /drivers/nearby rejects an invalid latitude', async () => {
    await request(app.getHttpServer() as Server)
      .get('/drivers/nearby')
      .query({
        latitude: '100',
        longitude: '147',
        radiusKm: '5',
      })
      .expect(400);

    expect(driversServiceMock.findNearby).not.toHaveBeenCalled();
  });

  it('GET /drivers/nearby rejects an invalid location freshness window', async () => {
    await request(app.getHttpServer() as Server)
      .get('/drivers/nearby')
      .query({
        latitude: '-9.4438',
        longitude: '147.2204',
        radiusKm: '5',
        maxLocationAgeSeconds: '5',
      })
      .expect(400);

    expect(driversServiceMock.findNearby).not.toHaveBeenCalled();
  });
  it('GET /drivers/nearby rejects a radius above 100 kilometres', async () => {
    await request(app.getHttpServer() as Server)
      .get('/drivers/nearby')
      .query({
        latitude: '-9.4438',
        longitude: '147.2204',
        radiusKm: '101',
      })
      .expect(400);

    expect(driversServiceMock.findNearby).not.toHaveBeenCalled();
  });

  it('PATCH /drivers/:id/status rejects an invalid driver status', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/drivers/driver-test-1/status')
      .send({
        status: 'BROKEN',
      })
      .expect(400);

    expect(driversServiceMock.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /drivers/:id/status accepts a valid driver status', async () => {
    const updatedDriver = {
      id: 'driver-test-1',
      status: 'SUSPENDED',
      isOnline: false,
      isAvailable: false,
    };

    driversServiceMock.updateStatus.mockResolvedValue(updatedDriver);

    await request(app.getHttpServer() as Server)
      .patch('/drivers/driver-test-1/status')
      .send({
        status: 'SUSPENDED',
      })
      .expect(200)
      .expect(updatedDriver);

    expect(driversServiceMock.updateStatus).toHaveBeenCalledWith(
      'driver-test-1',
      'SUSPENDED',
    );
  });
  it('PATCH /drivers/:id rejects lifecycle and live-state fields', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/drivers/driver-test-1')
      .send({
        status: 'SUSPENDED',
        isOnline: false,
        isAvailable: false,
      })
      .expect(400);

    expect(driversServiceMock.update).not.toHaveBeenCalled();
  });
  it('PATCH /drivers/me/availability rejects non-boolean values', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/drivers/me/availability')
      .send({
        isOnline: 'yes',
      })
      .expect(400);

    expect(driversServiceMock.updateAvailability).not.toHaveBeenCalled();
  });

  it('PATCH /drivers/me/availability accepts valid availability values', async () => {
    const updatedDriver = {
      id: 'driver-test-1',
      isOnline: true,
      isAvailable: false,
    };

    driversServiceMock.updateAvailability.mockResolvedValue(updatedDriver);

    await request(app.getHttpServer() as Server)
      .patch('/drivers/me/availability')
      .send({
        isOnline: true,
        isAvailable: false,
      })
      .expect(200)
      .expect(updatedDriver);

    expect(driversServiceMock.updateAvailability).toHaveBeenCalledWith(
      'driver-test-1',
      {
        isOnline: true,
        isAvailable: false,
      },
    );
  });
});
