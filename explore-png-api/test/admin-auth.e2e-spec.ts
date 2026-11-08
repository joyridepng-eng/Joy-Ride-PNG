import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { Server } from 'http';
import request from 'supertest';
import { AdminAuthController } from '../src/admin-auth/admin-auth.controller';
import { AdminAuthService } from '../src/admin-auth/admin-auth.service';

describe('Administrator authentication HTTP API', () => {
  let app: INestApplication;
  let httpServer: Server;

  const adminAuthServiceMock = {
    login: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60_000,
            limit: 100,
          },
        ]),
      ],
      controllers: [AdminAuthController],
      providers: [
        {
          provide: AdminAuthService,
          useValue: adminAuthServiceMock,
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

    httpServer = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a malformed email address', async () => {
    await request(httpServer)
      .post('/admin-auth/login')
      .send({
        email: 'not-an-email',
        password: 'Fictional-Password-123!',
      })
      .expect(400);

    expect(adminAuthServiceMock.login).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 12 characters', async () => {
    await request(httpServer)
      .post('/admin-auth/login')
      .send({
        email: 'admin@example.com',
        password: 'too-short',
      })
      .expect(400);

    expect(adminAuthServiceMock.login).not.toHaveBeenCalled();
  });

  it('rejects unknown request properties', async () => {
    await request(httpServer)
      .post('/admin-auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Fictional-Password-123!',
        adminApiKey: 'must-not-be-accepted',
      })
      .expect(400);

    expect(adminAuthServiceMock.login).not.toHaveBeenCalled();
  });

  it('accepts a valid login request', async () => {
    const response = {
      accessToken: 'fictional-access-token',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      admin: {
        id: 'admin-test-1',
        email: 'admin@example.com',
        fullName: 'Test Administrator',
        role: 'SUPER_ADMIN',
      },
    };

    adminAuthServiceMock.login.mockResolvedValue(response);

    await request(httpServer)
      .post('/admin-auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Fictional-Password-123!',
      })
      .expect(200)
      .expect(response);

    expect(adminAuthServiceMock.login).toHaveBeenCalledWith({
      email: 'admin@example.com',
      password: 'Fictional-Password-123!',
    });
  });
});
