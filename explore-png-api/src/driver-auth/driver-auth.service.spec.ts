import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { DriverAuthService } from './driver-auth.service';

describe('DriverAuthService', () => {
  const validPassword = 'Fictional-Driver-Password-123!';
  let passwordHash: string;
  let service: DriverAuthService;

  const prismaMock = {
    driver: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwtMock = {
    signAsync: jest.fn(),
  };

  const configMock = {
    getOrThrow: jest.fn(),
  };

  const driver = {
    id: 'driver-test-1',
    userId: null,
    fullName: 'Test Driver',
    phone: '+67570000002',
    email: 'driver@example.com',
    licenseNumber: 'DL-TEST-1',
    licenseClass: '6',
    licenseIssuedAt: new Date('2025-01-01T00:00:00.000Z'),
    licenseExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
    emergencyContactName: 'Test Contact',
    emergencyContactPhone: '+67570000003',
    emergencyContactRelationship: 'Family',
    status: DriverStatus.APPROVED,
    approvedAt: new Date(),
    approvedBy: null,
    suspensionReason: null,
    isOnline: false,
    isAvailable: false,
    passwordHash: '',
    isAuthActive: true,
    tokenVersion: 3,
    lastLoginAt: null,
    locationId: null,
    serviceZoneId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(validPassword, 4);

    service = new DriverAuthService(
      prismaMock as unknown as PrismaService,
      jwtMock as unknown as JwtService,
      configMock as unknown as ConfigService,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    configMock.getOrThrow.mockReturnValue('fictional-driver-jwt-secret');

    jwtMock.signAsync.mockResolvedValue('fictional-driver-access-token');
  });

  it('logs in an approved Driver with active credentials', async () => {
    prismaMock.driver.findUnique.mockResolvedValue({
      ...driver,
      passwordHash,
    });

    prismaMock.driver.update.mockResolvedValue({
      ...driver,
      passwordHash,
      lastLoginAt: new Date(),
    });

    const result = await service.login({
      phone: driver.phone,
      password: validPassword,
    });

    expect(prismaMock.driver.findUnique).toHaveBeenCalledWith({
      where: {
        phone: driver.phone,
      },
    });

    expect(prismaMock.driver.update).toHaveBeenCalledTimes(1);
    expect(jwtMock.signAsync).toHaveBeenCalledWith(
      {
        sub: driver.id,
        phone: driver.phone,
        tokenVersion: driver.tokenVersion,
        tokenType: 'driver-access',
      },
      {
        secret: 'fictional-driver-jwt-secret',
        expiresIn: 43200,
      },
    );

    expect(result).toEqual({
      accessToken: 'fictional-driver-access-token',
      tokenType: 'Bearer',
      expiresInSeconds: 43200,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        email: driver.email,
      },
    });

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect Driver password', async () => {
    prismaMock.driver.findUnique.mockResolvedValue({
      ...driver,
      passwordHash,
    });

    await expect(
      service.login({
        phone: driver.phone,
        password: 'Incorrect-Driver-Password-123!',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid Driver credentials'));

    expect(prismaMock.driver.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('rejects a Driver who is not approved', async () => {
    prismaMock.driver.findUnique.mockResolvedValue({
      ...driver,
      passwordHash,
      status: DriverStatus.PENDING,
    });

    await expect(
      service.login({
        phone: driver.phone,
        password: validPassword,
      }),
    ).rejects.toThrow('Invalid Driver credentials');

    expect(prismaMock.driver.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('rejects a Driver whose authentication is inactive', async () => {
    prismaMock.driver.findUnique.mockResolvedValue({
      ...driver,
      passwordHash,
      isAuthActive: false,
    });

    await expect(
      service.login({
        phone: driver.phone,
        password: validPassword,
      }),
    ).rejects.toThrow('Invalid Driver credentials');

    expect(prismaMock.driver.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('allows an Admin to set Driver credentials and revoke old tokens', async () => {
    prismaMock.driver.findUnique.mockResolvedValue({
      id: driver.id,
    });

    prismaMock.driver.update.mockResolvedValue({
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      email: driver.email,
      status: driver.status,
      isAuthActive: true,
      tokenVersion: 4,
    });

    const result = await service.setCredentials(driver.id, {
      password: validPassword,
    });

    expect(prismaMock.driver.update).toHaveBeenCalledTimes(1);

    const updateCalls = prismaMock.driver.update.mock.calls as unknown[][];

    const updateArgument = updateCalls[0]?.[0] as {
      where: {
        id: string;
      };
      data: {
        passwordHash: string;
        isAuthActive: boolean;
        tokenVersion: {
          increment: number;
        };
      };
    };

    expect(updateArgument.where).toEqual({
      id: driver.id,
    });

    expect(updateArgument.data.isAuthActive).toBe(true);
    expect(updateArgument.data.tokenVersion).toEqual({
      increment: 1,
    });
    expect(typeof updateArgument.data.passwordHash).toBe('string');
    expect(updateArgument.data.passwordHash).not.toBe(validPassword);

    expect(result.credentialsUpdated).toBe(true);
    expect(result.driver).not.toHaveProperty('passwordHash');
  });

  it('rejects credential setup for a missing Driver', async () => {
    prismaMock.driver.findUnique.mockResolvedValue(null);

    await expect(
      service.setCredentials('driver-missing', {
        password: validPassword,
      }),
    ).rejects.toThrow(new NotFoundException('Driver not found'));

    expect(prismaMock.driver.update).not.toHaveBeenCalled();
  });
});
