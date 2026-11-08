import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

type DriverAccessTokenPayload = {
  sub: string;
  phone: string;
  tokenVersion: number;
  tokenType: 'driver-access';
};

export type AuthenticatedDriver = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
};

export type DriverAuthenticatedRequest = Request & {
  driver?: AuthenticatedDriver;
};

@Injectable()
export class DriverJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<DriverAuthenticatedRequest>();

    const authorization = request.header('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Driver authentication is required');
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException('Driver authentication failed');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<DriverAccessTokenPayload>(token, {
          secret: this.config.getOrThrow<string>('DRIVER_JWT_SECRET'),
        });

      if (
        payload.tokenType !== 'driver-access' ||
        !payload.sub ||
        !Number.isInteger(payload.tokenVersion)
      ) {
        throw new UnauthorizedException();
      }

      const driver = await this.prisma.driver.findUnique({
        where: {
          id: payload.sub,
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

      if (
        !driver ||
        driver.status !== DriverStatus.APPROVED ||
        !driver.isAuthActive ||
        driver.tokenVersion !== payload.tokenVersion
      ) {
        throw new UnauthorizedException();
      }

      request.driver = {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        email: driver.email,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Driver authentication failed');
    }
  }
}
