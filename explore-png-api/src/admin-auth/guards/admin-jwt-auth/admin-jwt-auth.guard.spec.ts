import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AdminAuthenticatedRequest,
  AdminJwtAuthGuard,
} from './admin-jwt-auth.guard';

describe('AdminJwtAuthGuard', () => {
  const jwtMock = {
    verifyAsync: jest.fn(),
  };

  const configMock = {
    getOrThrow: jest.fn(),
  };

  const prismaMock = {
    adminAccount: {
      findUnique: jest.fn(),
    },
  };

  let guard: AdminJwtAuthGuard;
  let request: AdminAuthenticatedRequest;

  function contextForRequest(): ExecutionContext {
    return {
      getHandler: () => contextForRequest,
      getClass: () => AdminJwtAuthGuard,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    configMock.getOrThrow.mockReturnValue('fictional-admin-jwt-secret');

    request = {
      header: jest.fn(),
    } as unknown as AdminAuthenticatedRequest;

    guard = new AdminJwtAuthGuard(
      jwtMock as unknown as JwtService,
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
    );
  });

  it('rejects a request without a bearer token', async () => {
    (request.header as jest.Mock).mockReturnValue(undefined);

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      new UnauthorizedException('Administrator authentication is required'),
    );

    expect(jwtMock.verifyAsync).not.toHaveBeenCalled();
    expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a valid token for an active administrator', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-admin-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'admin-test-1',
      email: 'admin@example.com',
      role: AdminRole.SUPER_ADMIN,
      tokenVersion: 2,
      tokenType: 'admin-access',
    });

    prismaMock.adminAccount.findUnique.mockResolvedValue({
      id: 'admin-test-1',
      email: 'admin@example.com',
      fullName: 'Test Administrator',
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
      tokenVersion: 2,
    });

    await expect(guard.canActivate(contextForRequest())).resolves.toBe(true);

    expect(jwtMock.verifyAsync).toHaveBeenCalledWith('fictional-admin-token', {
      secret: 'fictional-admin-jwt-secret',
    });

    expect(prismaMock.adminAccount.findUnique).toHaveBeenCalledWith({
      where: { id: 'admin-test-1' },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    expect(request.admin).toEqual({
      id: 'admin-test-1',
      email: 'admin@example.com',
      fullName: 'Test Administrator',
      role: AdminRole.SUPER_ADMIN,
    });
  });

  it('rejects a token after its version has been revoked', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-revoked-token',
    );

    jwtMock.verifyAsync.mockResolvedValue({
      sub: 'admin-test-1',
      email: 'admin@example.com',
      role: AdminRole.SUPER_ADMIN,
      tokenVersion: 1,
      tokenType: 'admin-access',
    });

    prismaMock.adminAccount.findUnique.mockResolvedValue({
      id: 'admin-test-1',
      email: 'admin@example.com',
      fullName: 'Test Administrator',
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
      tokenVersion: 2,
    });

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Administrator authentication failed',
    );

    expect(request.admin).toBeUndefined();
  });

  it('rejects an invalid or expired token', async () => {
    (request.header as jest.Mock).mockReturnValue(
      'Bearer fictional-expired-token',
    );

    jwtMock.verifyAsync.mockRejectedValue(new Error('Token expired'));

    await expect(guard.canActivate(contextForRequest())).rejects.toThrow(
      'Administrator authentication failed',
    );

    expect(prismaMock.adminAccount.findUnique).not.toHaveBeenCalled();
  });
});
