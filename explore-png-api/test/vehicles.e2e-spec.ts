import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtAuthGuard } from '../src/admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { VehiclesController } from '../src/vehicles/vehicles.controller';
import { VehiclesService } from '../src/vehicles/vehicles.service';

describe('Vehicles HTTP API (non-destructive e2e)', () => {
  let app: INestApplication;

  const vehiclesServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    updateDriverAssignment: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        {
          provide: VehiclesService,
          useValue: vehiclesServiceMock,
        },
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: jest.fn().mockReturnValue(true),
      })
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
    await app.close();
  });

  it('GET /vehicles returns mocked vehicles', async () => {
    const vehicles = [
      {
        id: 'vehicle-pom-1',
        plateNumber: 'POM-001',
        make: 'Toyota',
        model: 'Hiace',
        driverId: 'driver-pom-1',
      },
    ];

    vehiclesServiceMock.findAll.mockResolvedValue(vehicles);

    await request(app.getHttpServer() as Server)
      .get('/vehicles')
      .expect(200)
      .expect(vehicles);

    expect(vehiclesServiceMock.findAll).toHaveBeenCalledWith(undefined);
  });

  it('GET /vehicles forwards the driverId filter', async () => {
    vehiclesServiceMock.findAll.mockResolvedValue([]);

    await request(app.getHttpServer() as Server)
      .get('/vehicles')
      .query({
        driverId: 'driver-lae-1',
      })
      .expect(200)
      .expect([]);

    expect(vehiclesServiceMock.findAll).toHaveBeenCalledWith('driver-lae-1');
  });

  it('GET /vehicles/:id returns a mocked vehicle', async () => {
    const vehicle = {
      id: 'vehicle-hagen-1',
      plateNumber: 'WH-001',
      make: 'Nissan',
      model: 'X-Trail',
    };

    vehiclesServiceMock.findOne.mockResolvedValue(vehicle);

    await request(app.getHttpServer() as Server)
      .get('/vehicles/vehicle-hagen-1')
      .expect(200)
      .expect(vehicle);

    expect(vehiclesServiceMock.findOne).toHaveBeenCalledWith('vehicle-hagen-1');
  });

  it('POST /vehicles rejects a missing driverId', async () => {
    await request(app.getHttpServer() as Server)
      .post('/vehicles')
      .send({
        plateNumber: 'POM-DRIVER-REQUIRED',
        make: 'Toyota',
        model: 'Hilux',
      })
      .expect(400);

    expect(vehiclesServiceMock.create).not.toHaveBeenCalled();
  });
  it('POST /vehicles rejects a missing plate number', async () => {
    await request(app.getHttpServer() as Server)
      .post('/vehicles')
      .send({
        make: 'Toyota',
        model: 'Corolla',
      })
      .expect(400);

    expect(vehiclesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /vehicles rejects an invalid vehicle year', async () => {
    await request(app.getHttpServer() as Server)
      .post('/vehicles')
      .send({
        plateNumber: 'LAE-001',
        year: 1899,
      })
      .expect(400);

    expect(vehiclesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /vehicles rejects an invalid seat count', async () => {
    await request(app.getHttpServer() as Server)
      .post('/vehicles')
      .send({
        plateNumber: 'KOK-001',
        seatCount: 0,
      })
      .expect(400);

    expect(vehiclesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /vehicles rejects unknown properties', async () => {
    await request(app.getHttpServer() as Server)
      .post('/vehicles')
      .send({
        plateNumber: 'POM-002',
        hiddenApprovalFlag: true,
      })
      .expect(400);

    expect(vehiclesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /vehicles accepts a valid vehicle request', async () => {
    const createdVehicle = {
      id: 'vehicle-test-1',
      plateNumber: 'LAE-002',
      make: 'Toyota',
      model: 'Hilux',
      year: 2022,
      seatCount: 5,
      driverId: 'driver-lae-1',
    };

    vehiclesServiceMock.create.mockResolvedValue(createdVehicle);

    await request(app.getHttpServer() as Server)
      .post('/vehicles')
      .send({
        plateNumber: 'LAE-002',
        make: 'Toyota',
        model: 'Hilux',
        year: 2022,
        seatCount: 5,
        driverId: 'driver-lae-1',
      })
      .expect(201)
      .expect(createdVehicle);

    expect(vehiclesServiceMock.create).toHaveBeenCalledWith({
      plateNumber: 'LAE-002',
      make: 'Toyota',
      model: 'Hilux',
      year: 2022,
      seatCount: 5,
      driverId: 'driver-lae-1',
    });
  });

  it('PATCH /vehicles/:id/driver rejects a missing driverId', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/vehicles/vehicle-test-1/driver')
      .send({})
      .expect(400);

    expect(vehiclesServiceMock.updateDriverAssignment).not.toHaveBeenCalled();
  });

  it('PATCH /vehicles/:id/driver accepts a valid driver assignment', async () => {
    const updatedVehicle = {
      id: 'vehicle-test-1',
      status: 'APPROVED',
      driverId: 'driver-test-2',
    };

    vehiclesServiceMock.updateDriverAssignment.mockResolvedValue(
      updatedVehicle,
    );

    await request(app.getHttpServer() as Server)
      .patch('/vehicles/vehicle-test-1/driver')
      .send({
        driverId: 'driver-test-2',
      })
      .expect(200)
      .expect(updatedVehicle);

    expect(vehiclesServiceMock.updateDriverAssignment).toHaveBeenCalledWith(
      'vehicle-test-1',
      'driver-test-2',
    );
  });
  it('PATCH /vehicles/:id/status rejects an invalid vehicle status', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/vehicles/vehicle-test-1/status')
      .send({
        status: 'BROKEN',
      })
      .expect(400);

    expect(vehiclesServiceMock.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /vehicles/:id/status accepts a valid vehicle status', async () => {
    const updatedVehicle = {
      id: 'vehicle-test-1',
      status: 'SUSPENDED',
      driverId: 'driver-test-1',
    };

    vehiclesServiceMock.updateStatus.mockResolvedValue(updatedVehicle);

    await request(app.getHttpServer() as Server)
      .patch('/vehicles/vehicle-test-1/status')
      .send({
        status: 'SUSPENDED',
      })
      .expect(200)
      .expect(updatedVehicle);

    expect(vehiclesServiceMock.updateStatus).toHaveBeenCalledWith(
      'vehicle-test-1',
      'SUSPENDED',
    );
  });
  it('PATCH /vehicles/:id rejects lifecycle and assignment fields', async () => {
    await request(app.getHttpServer() as Server)
      .patch('/vehicles/vehicle-test-1')
      .send({
        status: 'ACTIVE',
        driverId: 'driver-test-2',
      })
      .expect(400);

    expect(vehiclesServiceMock.update).not.toHaveBeenCalled();
  });
  it('PATCH /vehicles/:id accepts valid updates', async () => {
    const updatedVehicle = {
      id: 'vehicle-test-1',
      plateNumber: 'LAE-002',
      color: 'White',
      seatCount: 6,
    };

    vehiclesServiceMock.update.mockResolvedValue(updatedVehicle);

    await request(app.getHttpServer() as Server)
      .patch('/vehicles/vehicle-test-1')
      .send({
        color: 'White',
        seatCount: 6,
      })
      .expect(200)
      .expect(updatedVehicle);

    expect(vehiclesServiceMock.update).toHaveBeenCalledWith('vehicle-test-1', {
      color: 'White',
      seatCount: 6,
    });
  });
});
