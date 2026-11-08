import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

type RiderAccessTokenPayload = {
  sub: string;
  phone: string;
  tokenVersion: number;
  tokenType: 'rider-access';
};

export type AuthenticatedRider = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
};

export type RiderAuthenticatedRequest = Request & {
  rider?: AuthenticatedRider;
};

@Injectable()
export class RiderJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RiderAuthenticatedRequest>();

    const authorization = request.header('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Rider authentication is required');
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException('Rider authentication failed');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<RiderAccessTokenPayload>(token, {
          secret: this.config.getOrThrow<string>('RIDER_JWT_SECRET'),
        });

      if (
        payload.tokenType !== 'rider-access' ||
        !payload.sub ||
        !Number.isInteger(payload.tokenVersion)
      ) {
        throw new UnauthorizedException();
      }

      const rider = await this.prisma.riderAccount.findUnique({
        where: {
          id: payload.sub,
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          isActive: true,
          tokenVersion: true,
        },
      });

      if (
        !rider ||
        !rider.isActive ||
        rider.tokenVersion !== payload.tokenVersion
      ) {
        throw new UnauthorizedException();
      }

      request.rider = {
        id: rider.id,
        fullName: rider.fullName,
        phone: rider.phone,
        email: rider.email,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Rider authentication failed');
    }
  }
}
