import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DriverAuthenticatedRequest,
  DriverJwtAuthGuard,
} from './driver-jwt-auth.guard';

describe('DriverJwtAuthGuard', () => {
  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const configMock = {
    getOrThrow: jest.fn(),
  };

  const prismaMock = {
    driver: {
      findUnique: jest.fn(),
    },
  };

  let guard: DriverJwtAuthGuard;
  let request: DriverAuthenticatedRequest;

  function contextForRequest(): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configMock.getOrThrow.mockReturnValue('fictional-driver-jwt-secret');

    request = {
      header: jest.fn(),
    } as unknown as DriverAuthenticatedRequest;

    guard = new DriverJwtAuthGuard(
      jwtMock as unknown as JwtService,
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
    );
  });

  it('rejects a request without a bearer token', async () => {
    (request.header as jest.Mock).mockReturnValue(undefined);

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      new UnauthorizedException('Driver authentication is required'),
    );

    expect(jwtMock.verifyAsync).not.toHaveBeenCalled();
    expect(prismaMock.driver.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid token for an approved Driver', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-driver-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'driver-test-1',
      phone: '+67570000002',
      tokenVersion: 3,
      tokenType: 'driver-access',
    });

    prismaMock.driver.findUnique.mockResolvedValue({
      id: 'driver-test-1',
      fullName: 'Test Driver',
      phone: '+67570000002',
      email: 'driver@example.com',
      status: DriverStatus.APPROVED,
      isAuthActive: true,
      tokenVersion: 3,
    });

    await expect(guard.canActivate(contextForRequest())).resolves.toBe(true);

    expect(request.driver).toEqual({
      id: 'driver-test-1',
      fullName: 'Test Driver',
      phone: '+67570000002',
      email: 'driver@example.com',
    });
  });

  it('rejects a token with the wrong token type', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-rider-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'driver-test-1',
      phone: '+67570000002',
      tokenVersion: 3,
      tokenType: 'rider-access',
    });

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Driver authentication failed',
    );

    expect(prismaMock.driver.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token after Driver credentials are reset', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-revoked-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'driver-test-1',
      phone: '+67570000002',
      tokenVersion: 2,
      tokenType: 'driver-access',
    });

    prismaMock.driver.findUnique.mockResolvedValue({
      id: 'driver-test-1',
      fullName: 'Test Driver',
      phone: '+67570000002',
      email: null,
      status: DriverStatus.APPROVED,
      isAuthActive: true,
      tokenVersion: 3,
    });

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Driver authentication failed',
    );

    expect(request.driver).toBeUndefined();
  });

  it('rejects a suspended Driver with an otherwise valid token', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-driver-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'driver-test-1',
      phone: '+67570000002',
      tokenVersion: 3,
      tokenType: 'driver-access',
    });

    prismaMock.driver.findUnique.mockResolvedValue({
      id: 'driver-test-1',
      fullName: 'Test Driver',
      phone: '+67570000002',
      email: null,
      status: DriverStatus.SUSPENDED,
      isAuthActive: true,
      tokenVersion: 3,
    });

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Driver authentication failed',
    );

    expect(request.driver).toBeUndefined();
  });

  it('rejects an invalid or expired Driver token', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-expired-token',
    );

    jwtMock.verifyAsync.mockRejectedValue(new Error('Token expired'));

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Driver authentication failed',
    );

    expect(prismaMock.driver.findUnique).not.toHaveBeenCalled();
  });
});
