import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  RiderAuthenticatedRequest,
  RiderJwtAuthGuard,
} from './rider-jwt-auth.guard';

describe('RiderJwtAuthGuard', () => {
  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const configMock = {
    getOrThrow: jest.fn(),
  };

  const prismaMock = {
    riderAccount: {
      findUnique: jest.fn(),
    },
  };

  let guard: RiderJwtAuthGuard;
  let request: RiderAuthenticatedRequest;

  function contextForRequest(): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configMock.getOrThrow.mockReturnValue('fictional-rider-jwt-secret');

    request = {
      header: jest.fn(),
    } as unknown as RiderAuthenticatedRequest;

    guard = new RiderJwtAuthGuard(
      jwtMock as unknown as JwtService,
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
    );
  });

  it('rejects a request without a bearer token', async () => {
    (request.header as jest.Mock).mockReturnValue(undefined);

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      new UnauthorizedException('Rider authentication is required'),
    );

    expect(jwtMock.verifyAsync).not.toHaveBeenCalled();
    expect(prismaMock.riderAccount.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid token for an active Rider', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-rider-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'rider-test-1',
      phone: '+67570000001',
      tokenVersion: 2,
      tokenType: 'rider-access',
    });

    prismaMock.riderAccount.findUnique.mockResolvedValue({
      id: 'rider-test-1',
      fullName: 'Test Rider',
      phone: '+67570000001',
      email: 'rider@example.com',
      isActive: true,
      tokenVersion: 2,
    });

    await expect(guard.canActivate(contextForRequest())).resolves.toBe(true);

    expect(jwtMock.verifyAsync).toHaveBeenCalledWith('fictional-rider-token', {
      secret: 'fictional-rider-jwt-secret',
    });

    expect(request.rider).toEqual({
      id: 'rider-test-1',
      fullName: 'Test Rider',
      phone: '+67570000001',
      email: 'rider@example.com',
    });
  });

  it('rejects a token with the wrong token type', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-admin-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'rider-test-1',
      phone: '+67570000001',
      tokenVersion: 2,
      tokenType: 'admin-access',
    });

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Rider authentication failed',
    );

    expect(prismaMock.riderAccount.findUnique).not.toHaveBeenCalled();
    expect(request.rider).toBeUndefined();
  });

  it('rejects a Rider token after its version is revoked', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-revoked-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'rider-test-1',
      phone: '+67570000001',
      tokenVersion: 1,
      tokenType: 'rider-access',
    });

    prismaMock.riderAccount.findUnique.mockResolvedValue({
      id: 'rider-test-1',
      fullName: 'Test Rider',
      phone: '+67570000001',
      email: null,
      isActive: true,
      tokenVersion: 2,
    });

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Rider authentication failed',
    );

    expect(request.rider).toBeUndefined();
  });

  it('rejects an invalid or expired Rider token', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-expired-token',
    );

    jwtMock.verifyAsync.mockRejectedValue(new Error('Token expired'));

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Rider authentication failed',
    );

    expect(prismaMock.riderAccount.findUnique).not.toHaveBeenCalled();
  });
});
