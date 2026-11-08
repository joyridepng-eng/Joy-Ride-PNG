import { Reflector } from '@nestjs/core';
import { SUPER_ADMIN_ONLY } from '../../super-admin-only.decorator';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';

type AdminAccessTokenPayload = {
  sub: string;
  email: string;
  role: AdminRole;
  tokenVersion: number;
  tokenType: 'admin-access';
};

export type AuthenticatedAdmin = {
  id: string;
  email: string;
  fullName: string;
  role: AdminRole;
};

export type AdminAuthenticatedRequest = Request & {
  admin?: AuthenticatedAdmin;
};

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  private readonly reflector = new Reflector();
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();

    const authorization = request.header('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Administrator authentication is required',
      );
    }

    const token = authorization.slice('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException('Administrator authentication failed');
    }

    try {
      const payload =
        await this.jwtService.verifyAsync<AdminAccessTokenPayload>(token, {
          secret: this.config.getOrThrow<string>('ADMIN_JWT_SECRET'),
        });

      if (
        payload.tokenType !== 'admin-access' ||
        !payload.sub ||
        !Number.isInteger(payload.tokenVersion)
      ) {
        throw new UnauthorizedException();
      }

      const admin = await this.prisma.adminAccount.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          tokenVersion: true,
        },
      });

      if (
        !admin ||
        !admin.isActive ||
        admin.tokenVersion !== payload.tokenVersion
      ) {
        throw new UnauthorizedException();
      }

      request.admin = {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      };
    } catch {
      throw new UnauthorizedException('Administrator authentication failed');
    }

    const superAdminOnly = this.reflector.getAllAndOverride<boolean>(
      SUPER_ADMIN_ONLY,
      [context.getHandler(), context.getClass()],
    );

    if (superAdminOnly && request.admin?.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Super administrator permission is required',
      );
    }

    return true;
  }
}
