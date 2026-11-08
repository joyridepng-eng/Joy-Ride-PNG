import type { Server } from 'node:http';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth/admin-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { RiderJwtAuthGuard } from '../rider-auth/guards/rider-jwt-auth/rider-jwt-auth.guard';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRateLimitGuard } from './feedback-rate-limit.guard';

// Authentication is replaced ONLY in this isolated HTTP test module. Production
// still uses the actual JWT guards. These tests exercise role wiring and DTOs.
describe('Feedback HTTP boundaries', () => {
  let app: INestApplication<Server>;
  const service = {
    submit: jest.fn(),
    getMine: jest.fn(),
    driverSummary: jest.fn(),
    listForAdmin: jest.fn(),
    getForAdmin: jest.fn(),
    review: jest.fn(),
  };
  const roleGuard = (role: 'admin' | 'rider' | 'driver') => ({
    canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<{
        headers: Record<string, string | undefined>;
        admin?: { id: string };
        rider?: { id: string };
        driver?: { id: string };
      }>();
      if (req.headers['x-test-role'] !== role) return false;
      req[role] = { id: `${role}-authenticated` };
      return true;
    },
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FeedbackController],
      providers: [
        { provide: FeedbackService, useValue: service },
        FeedbackRateLimitGuard,
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue(roleGuard('admin'))
      .overrideGuard(RiderJwtAuthGuard)
      .useValue(roleGuard('rider'))
      .overrideGuard(DriverJwtAuthGuard)
      .useValue(roleGuard('driver'))
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

  it('rejects requests without authentication and requests using the wrong role', async () => {
    await request(app.getHttpServer())
      .post('/feedback/rider/me/rides/ride-1')
      .send({ overallRating: 5 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/feedback/rider/me/rides/ride-1')
      .set('x-test-role', 'driver')
      .send({ overallRating: 5 })
      .expect(403);
    await request(app.getHttpServer())
      .get('/feedback/admin')
      .set('x-test-role', 'rider')
      .expect(403);
    await request(app.getHttpServer())
      .get('/feedback/driver/me/summary')
      .set('x-test-role', 'rider')
      .expect(403);
    await request(app.getHttpServer())
      .get('/feedback/admin/feedback-1')
      .set('x-test-role', 'driver')
      .expect(403);
    await request(app.getHttpServer())
      .patch('/feedback/admin/feedback-1/review')
      .set('x-test-role', 'driver')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .get('/feedback/admin/drivers/driver-1/summary')
      .set('x-test-role', 'driver')
      .expect(403);
    await request(app.getHttpServer())
      .get('/feedback/rider/me/rides/ride-1')
      .set('x-test-role', 'driver')
      .expect(403);
    expect(service.submit).not.toHaveBeenCalled();
    expect(service.listForAdmin).not.toHaveBeenCalled();
  });
  it('derives rider and driver identity from the authenticated request', async () => {
    service.submit.mockResolvedValue({ id: 'feedback-1' });
    await request(app.getHttpServer())
      .post('/feedback/rider/me/rides/ride-1')
      .set('x-test-role', 'rider')
      .send({ overallRating: 5 })
      .expect(200);
    expect(service.submit).toHaveBeenCalledWith(
      'rider-authenticated',
      'ride-1',
      expect.objectContaining({ overallRating: 5 }),
    );
    service.getMine.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/feedback/rider/me/rides/ride-1')
      .set('x-test-role', 'rider')
      .expect(200, { feedback: null });
    service.driverSummary.mockResolvedValue({ ratingCount: 0 });
    await request(app.getHttpServer())
      .get('/feedback/driver/me/summary')
      .set('x-test-role', 'driver')
      .expect(200);
    expect(service.driverSummary).toHaveBeenCalledWith('driver-authenticated');
  });
  it('rejects injected identity or internal review properties', async () => {
    for (const property of ['riderId', 'driverId', 'reviewStatus']) {
      await request(app.getHttpServer())
        .post('/feedback/rider/me/rides/ride-1')
        .set('x-test-role', 'rider')
        .send({ overallRating: 5, [property]: 'forged' })
        .expect(400);
    }
    expect(service.submit).not.toHaveBeenCalled();
  });
  it('rejects invalid scores and oversized comments', async () => {
    for (const overallRating of [0, 6, 1.5, '5', null]) {
      await request(app.getHttpServer())
        .post('/feedback/rider/me/rides/ride-1')
        .set('x-test-role', 'rider')
        .send({ overallRating })
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/feedback/rider/me/rides/ride-1')
      .set('x-test-role', 'rider')
      .send({ overallRating: 5, customerCareRating: 6 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/feedback/rider/me/rides/ride-1')
      .set('x-test-role', 'rider')
      .send({ overallRating: 5, comment: 'x'.repeat(1001) })
      .expect(400);
    expect(service.submit).not.toHaveBeenCalled();
  });
  it('bounds Admin list size and rejects invalid status filters', async () => {
    await request(app.getHttpServer())
      .get('/feedback/admin?limit=51')
      .set('x-test-role', 'admin')
      .expect(400);
    await request(app.getHttpServer())
      .get('/feedback/admin?status=INVALID')
      .set('x-test-role', 'admin')
      .expect(400);
    service.listForAdmin.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer())
      .get('/feedback/admin?limit=10')
      .set('x-test-role', 'admin')
      .expect(200);
    expect(service.listForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });
  it('requires a review version and nonempty note, and derives the Admin actor', async () => {
    const dto = {
      expectedStatus: 'NEW',
      status: 'REVIEWED',
      note: 'Checked',
      expectedUpdatedAt: '2026-09-29T00:00:00.000Z',
    };
    await request(app.getHttpServer())
      .patch('/feedback/admin/feedback-1/review')
      .set('x-test-role', 'admin')
      .send({ ...dto, note: '  ' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/feedback/admin/feedback-1/review')
      .set('x-test-role', 'admin')
      .send({ ...dto, expectedUpdatedAt: 'invalid' })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/feedback/admin/feedback-1/review')
      .set('x-test-role', 'admin')
      .send({ ...dto, adminId: 'forged' })
      .expect(400);
    service.review.mockResolvedValue({ id: 'feedback-1' });
    await request(app.getHttpServer())
      .patch('/feedback/admin/feedback-1/review')
      .set('x-test-role', 'admin')
      .send(dto)
      .expect(200);
    expect(service.review).toHaveBeenCalledWith(
      'admin-authenticated',
      'feedback-1',
      expect.objectContaining(dto),
    );
  });
});
