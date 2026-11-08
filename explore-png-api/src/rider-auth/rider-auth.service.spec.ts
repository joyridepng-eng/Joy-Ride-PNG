import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RiderAuthService } from './rider-auth.service';

describe('RiderAuthService', () => {
  const validPassword = 'Fictional-Rider-Password-123!';
  let passwordHash: string;

  const prismaMock = {
    riderAccount: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const jwtMock = {
    signAsync: jest.fn(),
  };

  const rider = {
    id: 'rider-test-1',
    fullName: 'Test Rider',
    phone: '+67570000001',
    email: 'rider@example.com',
    passwordHash: '',
    isActive: true,
    tokenVersion: 0,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let service: RiderAuthService;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(validPassword, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    service = new RiderAuthService(
      prismaMock as unknown as PrismaService,
      jwtMock as unknown as JwtService,
    );

    prismaMock.riderAccount.findFirst.mockResolvedValue(null);
    jwtMock.signAsync.mockResolvedValue('fictional-rider-access-token');
  });

  it('registers a Rider and returns an access token', async () => {
    prismaMock.riderAccount.create.mockResolvedValue({
      ...rider,
      passwordHash,
    });

    const result = await service.register({
      fullName: '  Test Rider  ',
      phone: '+67570000001',
      email: '  RIDER@EXAMPLE.COM ',
      password: validPassword,
    });

    expect(prismaMock.riderAccount.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            phone: '+67570000001',
          },
          {
            email: 'rider@example.com',
          },
        ],
      },
      select: {
        phone: true,
        email: true,
      },
    });

    expect(prismaMock.riderAccount.create).toHaveBeenCalledTimes(1);

    const createCalls = prismaMock.riderAccount.create.mock
      .calls as unknown[][];

    const createArgument = createCalls[0]?.[0] as {
      data: {
        fullName: string;
        phone: string;
        email: string | undefined;
        passwordHash: string;
      };
    };

    const { passwordHash: createdPasswordHash, ...createdProfile } =
      createArgument.data;

    expect(createdProfile).toEqual({
      fullName: 'Test Rider',
      phone: '+67570000001',
      email: 'rider@example.com',
    });

    expect(typeof createdPasswordHash).toBe('string');
    expect(createdPasswordHash).not.toBe(validPassword);

    expect(jwtMock.signAsync).toHaveBeenCalledWith({
      sub: rider.id,
      phone: rider.phone,
      tokenVersion: rider.tokenVersion,
      tokenType: 'rider-access',
    });

    expect(result).toEqual({
      accessToken: 'fictional-rider-access-token',
      tokenType: 'Bearer',
      expiresInSeconds: 43200,
      rider: {
        id: rider.id,
        fullName: rider.fullName,
        phone: rider.phone,
        email: rider.email,
      },
    });

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate Rider registration', async () => {
    prismaMock.riderAccount.findFirst.mockResolvedValue({
      phone: rider.phone,
      email: rider.email,
    });

    await expect(
      service.register({
        fullName: rider.fullName,
        phone: rider.phone,
        email: rider.email,
        password: validPassword,
      }),
    ).rejects.toThrow(
      new ConflictException(
        'A Rider account already exists for that phone or email',
      ),
    );

    expect(prismaMock.riderAccount.create).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('logs in an active Rider with valid credentials', async () => {
    prismaMock.riderAccount.findUnique.mockResolvedValue({
      ...rider,
      passwordHash,
    });

    prismaMock.riderAccount.update.mockResolvedValue({
      ...rider,
      passwordHash,
      lastLoginAt: new Date(),
    });

    const result = await service.login({
      phone: rider.phone,
      password: validPassword,
    });

    expect(prismaMock.riderAccount.findUnique).toHaveBeenCalledWith({
      where: {
        phone: rider.phone,
      },
    });

    expect(prismaMock.riderAccount.update).toHaveBeenCalledTimes(1);

    expect(result.accessToken).toBe('fictional-rider-access-token');
    expect(result.rider.id).toBe(rider.id);
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects an incorrect Rider password', async () => {
    prismaMock.riderAccount.findUnique.mockResolvedValue({
      ...rider,
      passwordHash,
    });

    await expect(
      service.login({
        phone: rider.phone,
        password: 'Incorrect-Rider-Password-123!',
      }),
    ).rejects.toThrow(new UnauthorizedException('Invalid Rider credentials'));

    expect(prismaMock.riderAccount.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an inactive Rider account', async () => {
    prismaMock.riderAccount.findUnique.mockResolvedValue({
      ...rider,
      passwordHash,
      isActive: false,
    });

    await expect(
      service.login({
        phone: rider.phone,
        password: validPassword,
      }),
    ).rejects.toThrow('Invalid Rider credentials');

    expect(prismaMock.riderAccount.update).not.toHaveBeenCalled();
    expect(jwtMock.signAsync).not.toHaveBeenCalled();
  });
});
