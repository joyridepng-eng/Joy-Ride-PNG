import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SERVICE_NAME = 'explore-png-api';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLiveness() {
    return {
      status: 'ok' as const,
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    try {
      await this.prisma.$queryRaw<Array<{ result: number }>>`
        SELECT 1 AS result
      `;

      return {
        status: 'ok' as const,
        service: SERVICE_NAME,
        checks: {
          database: 'connected' as const,
        },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        service: SERVICE_NAME,
        checks: {
          database: 'disconnected',
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}
