import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AdminLoginDto } from './dto/admin-login.dto';

const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;

@Injectable()
export class AdminAuthService {
  private readonly dummyPasswordHash = bcrypt.hash(
    randomBytes(32).toString('hex'),
    12,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: AdminLoginDto) {
    const email = dto.email.trim().toLowerCase();

    const admin = await this.prisma.adminAccount.findUnique({
      where: { email },
    });

    const passwordHash = admin?.passwordHash ?? (await this.dummyPasswordHash);

    const passwordMatches = await bcrypt.compare(dto.password, passwordHash);

    if (!admin || !admin.isActive || !passwordMatches) {
      throw new UnauthorizedException('Invalid administrator credentials');
    }

    await this.prisma.adminAccount.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwtService.signAsync({
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tokenVersion: admin.tokenVersion,
      tokenType: 'admin-access',
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_LIFETIME_SECONDS,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      },
    };
  }
}
