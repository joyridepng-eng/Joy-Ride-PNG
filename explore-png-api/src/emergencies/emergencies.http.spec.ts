import type { Server } from 'node:http';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { EmergencyDriverGuard } from './emergency-driver.guard';
import { EmergencyRateLimitGuard } from './emergency-rate-limit.guard';
import { EmergenciesController } from './emergencies.controller';
import { EmergenciesService } from './emergencies.service';

const requestId = '20377aab-2ae3-4a94-8d20-f0c19cae7320';
describe('Emergency HTTP boundaries', () => {
  let app: INestApplication<Server>;
  const service = {
    create: jest.fn(),
    listMine: jest.fn(),
    getMine: jest.fn(),
    listAdmin: jest.fn(),
    getAdmin: jest.fn(),
    acknowledge: jest.fn(),
    resolve: jest.fn(),
  };
  const roleGuard = (role: 'driver' | 'admin') => ({
    canActivate(ctx: ExecutionContext) {
      const req = ctx.switchToHttp().getRequest<{
        headers: Record<string, string | undefined>;
        driver?: { id: string };
        admin?: { id: string };
      }>();
      if (req.headers['x-test-role'] !== role) return false;
      req[role] = { id: `${role}-authenticated` };
      return true;
    },
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EmergenciesController],
      providers: [
        { provide: EmergenciesService, useValue: service },
        EmergencyRateLimitGuard,
      ],
    })
      .overrideGuard(EmergencyDriverGuard)
      .useValue(roleGuard('driver'))
      .overrideGuard(AdminJwtAuthGuard)
      .useValue(roleGuard('admin'))
      .compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  beforeEach(() => jest.resetAllMocks());
  afterAll(async () => {
    await app.close();
  });

  it('rejects missing authentication and crossing Driver/Admin boundaries', async () => {
    await request(app.getHttpServer())
      .post('/emergencies/driver/me')
      .send({ clientRequestId: requestId })
      .expect(403);
    await request(app.getHttpServer())
      .post('/emergencies/driver/me')
      .set('x-test-role', 'rider')
      .send({ clientRequestId: requestId })
      .expect(403);
    for (const url of ['/emergencies/admin', '/emergencies/admin/alert-1']) {
      await request(app.getHttpServer())
        .get(url)
        .set('x-test-role', 'driver')
        .expect(403);
    }
    for (const action of ['acknowledge', 'resolve']) {
      await request(app.getHttpServer())
        .patch(`/emergencies/admin/alert-1/${action}`)
        .set('x-test-role', 'driver')
        .send({ note: 'test' })
        .expect(403);
    }
    await request(app.getHttpServer())
      .get('/emergencies/driver/me/alert-1')
      .set('x-test-role', 'admin')
      .expect(403);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('uses authenticated identity and accepts absent or malformed GPS metadata', async () => {
    service.create.mockResolvedValue({
      id: 'alert-1',
      serverReceived: true,
      humanAcknowledged: false,
    });
    for (const metadata of [
      {},
      { location: 'GPS unavailable', clientOccurredAt: 'bad clock' },
    ]) {
      await request(app.getHttpServer())
        .post('/emergencies/driver/me')
        .set('x-test-role', 'driver')
        .send({ clientRequestId: requestId.toUpperCase(), ...metadata })
        .expect(200);
    }
    expect(service.create).toHaveBeenLastCalledWith(
      'driver-authenticated',
      expect.objectContaining({
        clientRequestId: requestId,
        location: 'GPS unavailable',
      }),
    );
  });
  it('rejects forged identity, status and server timestamps', async () => {
    for (const property of [
      'driverId',
      'adminId',
      'status',
      'acknowledgedAt',
    ]) {
      await request(app.getHttpServer())
        .post('/emergencies/driver/me')
        .set('x-test-role', 'driver')
        .send({ clientRequestId: requestId, [property]: 'forged' })
        .expect(400);
    }
    expect(service.create).not.toHaveBeenCalled();
  });
  it('requires a UUID request identifier and bounds message length', async () => {
    for (const dto of [
      {},
      { clientRequestId: 'bad' },
      { clientRequestId: requestId, message: 'x'.repeat(501) },
    ]) {
      await request(app.getHttpServer())
        .post('/emergencies/driver/me')
        .set('x-test-role', 'driver')
        .send(dto)
        .expect(400);
    }
    expect(service.create).not.toHaveBeenCalled();
  });
  it('bounds lists and does not let Driver queries choose another identity', async () => {
    await request(app.getHttpServer())
      .get('/emergencies/driver/me?driverId=other')
      .set('x-test-role', 'driver')
      .expect(400);
    await request(app.getHttpServer())
      .get('/emergencies/admin?limit=51')
      .set('x-test-role', 'admin')
      .expect(400);
    await request(app.getHttpServer())
      .get('/emergencies/admin?status=BAD')
      .set('x-test-role', 'admin')
      .expect(400);
    service.listMine.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer())
      .get('/emergencies/driver/me')
      .set('x-test-role', 'driver')
      .expect(200);
    expect(service.listMine).toHaveBeenCalledWith(
      'driver-authenticated',
      expect.objectContaining({ limit: 25 }),
    );
  });
  it('requires a resolution note and derives the audit actor from Admin authentication', async () => {
    await request(app.getHttpServer())
      .patch('/emergencies/admin/alert-1/resolve')
      .set('x-test-role', 'admin')
      .send({ note: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/emergencies/admin/alert-1/resolve')
      .set('x-test-role', 'admin')
      .send({ note: 'x'.repeat(1001) })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/emergencies/admin/alert-1/acknowledge')
      .set('x-test-role', 'admin')
      .send({ adminId: 'forged' })
      .expect(400);
    service.acknowledge.mockResolvedValue({
      id: 'alert-1',
      status: 'ACKNOWLEDGED',
    });
    await request(app.getHttpServer())
      .patch('/emergencies/admin/alert-1/acknowledge')
      .set('x-test-role', 'admin')
      .send({})
      .expect(200);
    expect(service.acknowledge).toHaveBeenCalledWith(
      'admin-authenticated',
      'alert-1',
      undefined,
    );
    service.resolve.mockResolvedValue({ id: 'alert-1', status: 'RESOLVED' });
    await request(app.getHttpServer())
      .patch('/emergencies/admin/alert-1/resolve')
      .set('x-test-role', 'admin')
      .send({ note: ' Follow-up completed ' })
      .expect(200);
    expect(service.resolve).toHaveBeenCalledWith(
      'admin-authenticated',
      'alert-1',
      'Follow-up completed',
    );
  });
});
