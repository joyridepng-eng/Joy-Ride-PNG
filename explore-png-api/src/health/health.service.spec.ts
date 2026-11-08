import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const prismaMock = {
    $queryRaw: jest.fn(),
  };

  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new HealthService(prismaMock as unknown as PrismaService);
  });

  it('returns a safe liveness report', () => {
    const result = service.getLiveness();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('explore-png-api');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns ready when the database responds', async () => {
    prismaMock.$queryRaw.mockResolvedValue([
      {
        result: 1,
      },
    ]);

    const result = await service.getReadiness();

    expect(result.status).toBe('ok');
    expect(result.service).toBe('explore-png-api');
    expect(result.checks.database).toBe('connected');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('returns a safe unavailable response without leaking database details', async () => {
    prismaMock.$queryRaw.mockRejectedValue(
      new Error('private database connection detail'),
    );

    try {
      await service.getReadiness();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);

      const response = (error as ServiceUnavailableException).getResponse();

      expect(JSON.stringify(response)).not.toContain(
        'private database connection detail',
      );

      expect(response).toEqual({
        status: 'unavailable',
        service: 'explore-png-api',
        checks: {
          database: 'disconnected',
        },
        timestamp: (
          response as {
            timestamp: string;
          }
        ).timestamp,
      });

      expect(
        Number.isNaN(
          Date.parse(
            (
              response as {
                timestamp: string;
              }
            ).timestamp,
          ),
        ),
      ).toBe(false);
    }
  });
});
