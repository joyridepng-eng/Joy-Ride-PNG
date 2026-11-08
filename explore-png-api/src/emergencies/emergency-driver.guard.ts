import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DriverStatus } from '@prisma/client';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmergencyDriverGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<DriverAuthenticatedRequest>();
    const authorization = request.header('authorization');
    if (!authorization?.startsWith('Bearer '))
      throw new UnauthorizedException('Driver authentication is required');
    const token = authorization.slice(7).trim();
    if (!token)
      throw new UnauthorizedException('Driver authentication is required');
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: unknown;
        tokenType?: unknown;
        tokenVersion?: unknown;
      }>(token, {
        secret: this.config.getOrThrow<string>('DRIVER_JWT_SECRET'),
      });
      if (
        payload.tokenType !== 'driver-access' ||
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        !Number.isInteger(payload.tokenVersion)
      ) {
        throw new UnauthorizedException();
      }
      const driver = await this.prisma.driver.findUnique({
        where: { id: payload.sub },
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
        !driver.isAuthActive ||
        driver.tokenVersion !== payload.tokenVersion ||
        (driver.status !== DriverStatus.APPROVED &&
          driver.status !== DriverStatus.SUSPENDED)
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
