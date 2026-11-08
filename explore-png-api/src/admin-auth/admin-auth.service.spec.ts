import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AdminAuthService } from './admin-auth.service';

describe('AdminAuthService', () => {
  const validPassword = 'Fictional-Test-Password-123!';
  let passwordHash: string;

  const prismaMock = {
    adminAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwtMock = {
    signAsync: jest.fn(),
  };

  let service: AdminAuthService;

  const admin = {
    id: 'admin-test-1',
    email: 'admin@example.com',
    passwordHash: '',
    fullName: 'Test Administrator',
    role: AdminRole.SUPER_ADMIN,
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(validPassword, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    service = new AdminAuthService(
      prismaMock as unknown as PrismaService,
      jwtMock as unknown as JwtService,
    );
  });

  it('returns a short-lived access token for valid credentials', async () => {
    prismaMock.adminAccount.findUnique.mockResolvedValue({
      ...admin,
      passwordHash,
    });

    prismaMock.adminAccount.update.mockResolvedValue({
      ...admin,
      passwordHash,
      lastLoginAt: new Date(),
    });

    jwtMock.signAsync.mockResolvedValue('fictional-access-token');

    const result = await service.login({
      email: '  ADMIN@EXAMPLE.COM ',
      password: validPassword,
    });

    expect(prismaMock.adminAccount.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@example.com' },
    });

    expect(prismaMock.adminAccount.update).toHaveBeenCalledTimes(1);

    const updateCalls = prismaMock.adminAccount.update.mock
      .calls as unknown[][];

    const updateArgument: unknown = updateCalls[0]?.[0];

    const typedUpdateArgument = updateArgument as {
      where: { id: string };
      data: { lastLoginAt: unknown };
    };

    expect(typedUpdateArgument.where).toEqual({
      id: admin.id,
    });

    expect(typedUpdateArgument.data.lastLoginAt).toBeInstanceOf(Date);

    expect(jwtMock.signAsync).toHaveBeenCalledWith({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tokenVersion: admin.tokenVersion,
      tokenType: 'admin-access',
    });

    expect(result).toEqual({
      accessToken: 'fictional-access-token',
      tokenType: 'Bearer',
      expiresInSeconds: 900,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      },
    });

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect password without issuing a token', async () => {
    prismaMock.adminAccount.findUnique.mockResolvedValue({
      ...admin,
      passwordHash,
    });

    await expect(
      service.login({
        email: admin.email,
        password: 'Incorrect-Password-123!',
      }),
    ).rejects.toThrow(
      new UnauthorizedException('Invalid administrator credentials'),
    );

    expect(prismaMock.adminAccount.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an inactive administrator', async () => {
    prismaMock.adminAccount.findUnique.mockResolvedValue({
      ...admin,
      passwordHash,
      isActive: false,
    });

    await expect(
      service.login({
        email: admin.email,
        password: validPassword,
      }),
    ).rejects.toThrow('Invalid administrator credentials');

    expect(prismaMock.adminAccount.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });
});
