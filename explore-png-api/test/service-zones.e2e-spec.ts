import type { Server } from 'node:http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { ServiceZonesController } from '../src/service-zones/service-zones.controller';
import { ServiceZonesService } from '../src/service-zones/service-zones.service';

describe('Service Zones HTTP API (non-destructive e2e)', () => {
  let app: INestApplication;

  const testSecret = 'fictional-service-zone-test-key-not-for-production';
  const jwtService = new JwtService();
  const adminAccount = {
    id: 'admin-test-1',
    email: 'admin@example.com',
    fullName: 'Test Administrator',
    role: AdminRole.SUPER_ADMIN,
    isActive: true,
    tokenVersion: 1,
  };
  const prismaMock = {
    adminAccount: { findUnique: jest.fn() },
  };

  function tokenFor(tokenType = 'admin-access', tokenVersion = 1) {
    return jwtService.sign(
      {
        sub: adminAccount.id,
        email: adminAccount.email,
        role: adminAccount.role,
        tokenType,
        tokenVersion,
      },
      { secret: testSecret, expiresIn: '5m' },
    );
  }

  function adminAuthorization() {
    return `Bearer ${tokenFor()}`;
  }

  const serviceZonesServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ServiceZonesController],
      providers: [
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              if (key !== 'ADMIN_JWT_SECRET') {
                throw new Error(`Unexpected configuration key: ${key}`);
              }
              return testSecret;
            },
          },
        },
        {
          provide: ServiceZonesService,
          useValue: serviceZonesServiceMock,
        },
      ],
    }).compile();

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
    prismaMock.adminAccount.findUnique.mockReset();
    prismaMock.adminAccount.findUnique.mockResolvedValue({ ...adminAccount });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /service-zones returns mocked service zones', async () => {
    const zones = [
      {
        id: 'zone-pom-boroko',
        name: 'Boroko',
        locationId: 1,
      },
    ];

    serviceZonesServiceMock.findAll.mockResolvedValue(zones);

    await request(app.getHttpServer() as Server)
      .get('/service-zones')
      .expect(200)
      .expect(zones);

    expect(serviceZonesServiceMock.findAll).toHaveBeenCalledWith(undefined);
  });

  it('GET /service-zones forwards the locationId filter', async () => {
    serviceZonesServiceMock.findAll.mockResolvedValue([]);

    await request(app.getHttpServer() as Server)
      .get('/service-zones')
      .query({
        locationId: '2',
      })
      .expect(200)
      .expect([]);

    expect(serviceZonesServiceMock.findAll).toHaveBeenCalledWith('2');
  });

  it('GET /service-zones/:id returns a mocked service zone', async () => {
    const zone = {
      id: 'zone-lae-eriku',
      name: 'Eriku',
      locationId: 2,
    };

    serviceZonesServiceMock.findOne.mockResolvedValue(zone);

    await request(app.getHttpServer() as Server)
      .get('/service-zones/zone-lae-eriku')
      .expect(200)
      .expect(zone);

    expect(serviceZonesServiceMock.findOne).toHaveBeenCalledWith(
      'zone-lae-eriku',
    );
  });

  it('POST /service-zones rejects missing required fields', async () => {
    await request(app.getHttpServer() as Server)
      .post('/service-zones')
      .set('Authorization', adminAuthorization())
      .send({})
      .expect(400);

    expect(serviceZonesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /service-zones rejects an invalid latitude', async () => {
    await request(app.getHttpServer() as Server)
      .post('/service-zones')
      .set('Authorization', adminAuthorization())
      .send({
        name: 'Invalid Zone',
        locationId: '3',
        centerLatitude: 91,
      })
      .expect(400);

    expect(serviceZonesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /service-zones rejects an invalid longitude', async () => {
    await request(app.getHttpServer() as Server)
      .post('/service-zones')
      .set('Authorization', adminAuthorization())
      .send({
        name: 'Invalid Zone',
        locationId: '3',
        centerLongitude: 181,
      })
      .expect(400);

    expect(serviceZonesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /service-zones rejects a negative coverage radius', async () => {
    await request(app.getHttpServer() as Server)
      .post('/service-zones')
      .set('Authorization', adminAuthorization())
      .send({
        name: 'Invalid Zone',
        locationId: '3',
        coverageRadiusKm: -1,
      })
      .expect(400);

    expect(serviceZonesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /service-zones rejects unknown properties', async () => {
    await request(app.getHttpServer() as Server)
      .post('/service-zones')
      .set('Authorization', adminAuthorization())
      .send({
        name: 'Kokopo Town',
        locationId: '4',
        hiddenExpansionFlag: true,
      })
      .expect(400);

    expect(serviceZonesServiceMock.create).not.toHaveBeenCalled();
  });

  it('POST /service-zones accepts a valid service-zone request', async () => {
    const createdZone = {
      id: 'zone-hagen-town',
      name: 'Mt. Hagen Town',
      locationId: 3,
      centerLatitude: -5.8575,
      centerLongitude: 144.2306,
      coverageRadiusKm: 12,
    };

    serviceZonesServiceMock.create.mockResolvedValue(createdZone);

    await request(app.getHttpServer() as Server)
      .post('/service-zones')
      .set('Authorization', adminAuthorization())
      .send({
        name: 'Mt. Hagen Town',
        locationId: '3',
        centerLatitude: -5.8575,
        centerLongitude: 144.2306,
        coverageRadiusKm: 12,
      })
      .expect(201)
      .expect(createdZone);

    expect(serviceZonesServiceMock.create).toHaveBeenCalledWith({
      name: 'Mt. Hagen Town',
      locationId: '3',
      centerLatitude: -5.8575,
      centerLongitude: 144.2306,
      coverageRadiusKm: 12,
    });
  });

  it('PATCH /service-zones/:id accepts valid updates', async () => {
    const updatedZone = {
      id: 'zone-kokopo-town',
      name: 'Kokopo Town',
      isAirportZone: false,
      coverageRadiusKm: 15,
    };

    serviceZonesServiceMock.update.mockResolvedValue(updatedZone);

    await request(app.getHttpServer() as Server)
      .patch('/service-zones/zone-kokopo-town')
      .set('Authorization', adminAuthorization())
      .send({
        isAirportZone: false,
        coverageRadiusKm: 15,
      })
      .expect(200)
      .expect(updatedZone);

    expect(serviceZonesServiceMock.update).toHaveBeenCalledWith(
      'zone-kokopo-town',
      {
        isAirportZone: false,
        coverageRadiusKm: 15,
      },
    );
  });

  describe.each(['post', 'patch', 'delete'] as const)(
    '%s service-zone authorization',
    (method) => {
      function writeRequest() {
        const server = app.getHttpServer() as Server;
        if (method === 'post') {
          return request(server)
            .post('/service-zones')
            .send({ name: 'Test Zone', locationId: '1' });
        }
        if (method === 'patch') {
          return request(server)
            .patch('/service-zones/zone-test')
            .send({ name: 'Updated Test Zone' });
        }
        return request(server).delete('/service-zones/zone-test');
      }

      function expectNoWrites() {
        expect(serviceZonesServiceMock.create).not.toHaveBeenCalled();
        expect(serviceZonesServiceMock.update).not.toHaveBeenCalled();
        expect(serviceZonesServiceMock.remove).not.toHaveBeenCalled();
      }

      it('rejects missing authentication before any service write', async () => {
        await writeRequest().expect(401);
        expectNoWrites();
        expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
      });

      it('rejects an invalid token', async () => {
        await writeRequest()
          .set('Authorization', 'Bearer invalid-test-token')
          .expect(401);
        expectNoWrites();
        expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
      });

      it('rejects a token signed with another key', async () => {
        const token = jwtService.sign(
          { sub: adminAccount.id, tokenType: 'admin-access', tokenVersion: 1 },
          { secret: 'different-fictional-test-key', expiresIn: '5m' },
        );
        await writeRequest()
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
        expectNoWrites();
        expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
      });

      it('rejects an expired token', async () => {
        const token = jwtService.sign(
          { sub: adminAccount.id, tokenType: 'admin-access', tokenVersion: 1 },
          { secret: testSecret, expiresIn: -60 },
        );
        await writeRequest()
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
        expectNoWrites();
        expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
      });

      it.each(['rider-access', 'driver-access'])(
        'rejects a %s token even when signed with the test admin key',
        async (tokenType) => {
          await writeRequest()
            .set('Authorization', `Bearer ${tokenFor(tokenType)}`)
            .expect(401);
          expectNoWrites();
          expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
        },
      );

      it('rejects a deleted administrator', async () => {
        prismaMock.adminAccount.findUnique.mockResolvedValue(null);
        await writeRequest()
          .set('Authorization', adminAuthorization())
          .expect(401);
        expectNoWrites();
      });

      it('rejects an inactive administrator', async () => {
        prismaMock.adminAccount.findUnique.mockResolvedValue({
          ...adminAccount,
          isActive: false,
        });
        await writeRequest()
          .set('Authorization', adminAuthorization())
          .expect(401);
        expectNoWrites();
      });

      it('rejects a revoked token', async () => {
        await writeRequest()
          .set('Authorization', `Bearer ${tokenFor('admin-access', 0)}`)
          .expect(401);
        expectNoWrites();
      });

      it('accepts an active administrator with a valid token', async () => {
        const result = { id: 'zone-test', name: 'Test Zone' };
        serviceZonesServiceMock.create.mockResolvedValue(result);
        serviceZonesServiceMock.update.mockResolvedValue(result);
        serviceZonesServiceMock.remove.mockResolvedValue(result);

        await writeRequest()
          .set('Authorization', adminAuthorization())
          .expect(method === 'post' ? 201 : 200)
          .expect(result);

        expect(prismaMock.adminAccount.findUnique).toHaveBeenCalledTimes(1);
        if (method === 'post') {
          expect(serviceZonesServiceMock.create).toHaveBeenCalledWith({
            name: 'Test Zone',
            locationId: '1',
          });
        } else if (method === 'patch') {
          expect(serviceZonesServiceMock.update).toHaveBeenCalledWith(
            'zone-test',
            { name: 'Updated Test Zone' },
          );
        } else {
          expect(serviceZonesServiceMock.remove).toHaveBeenCalledWith(
            'zone-test',
          );
        }
      });
    },
  );
});
