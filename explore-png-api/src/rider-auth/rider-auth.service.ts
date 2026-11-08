import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RiderLoginDto } from './dto/rider-login.dto';
import { RiderRegisterDto } from './dto/rider-register.dto';

const ACCESS_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;
const PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class RiderAuthService {
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString('hex'),
    PASSWORD_HASH_ROUNDS,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RiderRegisterDto) {
    const fullName = dto.fullName.trim();
    const phone = dto.phone.trim();
    const email = dto.email?.trim().toLowerCase();

    if (!fullName) {
      throw new BadRequestException('Rider full name is required');
    }

    const existingAccount = await this.prisma.riderAccount.findFirst({
      where: {
        OR: [{ phone }, ...(email ? [{ email }] : [])],
      },
      select: {
        phone: true,
        email: true,
      },
    });

    if (existingAccount) {
      throw new ConflictException(
        'A Rider account already exists for that phone or email',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_HASH_ROUNDS);

    try {
      const rider = await this.prisma.riderAccount.create({
        data: {
          fullName,
          phone,
          email,
          passwordHash,
        },
      });

      return this.issueAccessToken(rider);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A Rider account already exists for that phone or email',
        );
      }

      throw error;
    }
  }

  async login(dto: RiderLoginDto) {
    const phone = dto.phone.trim();

    const rider = await this.prisma.riderAccount.findUnique({
      where: {
        phone,
      },
    });

    const passwordHash = rider?.passwordHash ?? (await this.dummyPasswordHash);

    const passwordMatches = await bcrypt.compare(dto.password, passwordHash);

    if (!rider || !rider.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid Rider credentials');
    }

    const updatedRider = await this.prisma.riderAccount.update({
      where: {
        id: rider.id,
      },
      data: {
        lastLoginAt: new Date(),
      },
    });

    return this.issueAccessToken(updatedRider);
  }

  private async issueAccessToken(rider: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    tokenVersion: number;
  }) {
    const accessToken = await this.jwtService.signAsync({
      sub: rider.id,
      phone: rider.phone,
      tokenVersion: rider.tokenVersion,
      tokenType: 'rider-access',
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_LIFETIME_SECONDS,
      rider: {
        id: rider.id,
        fullName: rider.fullName,
        phone: rider.phone,
        email: rider.email,
      },
    };
  }
}
