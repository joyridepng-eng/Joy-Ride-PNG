import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DriverLoginDto } from './dto/driver-login.dto';
import { SetDriverCredentialsDto } from './dto/set-driver-credentials.dto';

const ACCESS_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
const PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class DriverAuthService {
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString('hex'),
    PASSWORD_HASH_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: DriverLoginDto) {
    const phone = dto.phone.trim();

    const driver = await this.prisma.driver.findUnique({
      where: {
        phone,
      },
    });

    const passwordHash = driver?.passwordHash ?? (await this.dummyPasswordHash);

    const passwordMatches = await bcrypt.compare(dto.password, passwordHash);

    if (
      !driver ||
      driver.status !== DriverStatus.APPROVED ||
      !driver.isAuthActive ||
      !driver.passwordHash ||
      !passwordMatches
    ) {
      throw new UnauthorizedException('Invalid Driver credentials');
    }

    const updatedDriver = await this.prisma.driver.update({
      where: {
        id: driver.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return this.issueAccessToken(updatedDriver);
  }

  async setCredentials(driverId: string, dto: SetDriverCredentialsDto) {
    const driver = await this.prisma.driver.findUnique({
      where: {
        id: driverId,
      },
      select: {
        id: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    const updatedDriver = await this.prisma.driver.update({
      where: {
        id: driverId,
      },
      data: {
        passwordHash,
        isAuthActive: true,
        tokenVersion: {
          increment: 1,
        },
      },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        status: true,
        isAuthActive: true,
        tokenVersion: true,
      },
    });

    return {
      credentialsUpdated: true,
      driver: updatedDriver,
    };
  }

  private async issueAccessToken(driver: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    tokenVersion: number;
  }) {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: driver.id,
        phone: driver.phone,
        tokenVersion: driver.tokenVersion,
        tokenType: 'driver-access',
      },
      {
        secret: this.config.getOrThrow<string>('DRIVER_JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
      },
    );

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_LIFETIME_SECONDS,
      driver: {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        email: driver.email,
      },
    };
  }
}
