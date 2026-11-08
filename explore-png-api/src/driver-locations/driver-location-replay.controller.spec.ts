import { UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverJwtAuthGuard } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverLocationReplayController } from './driver-location-replay.controller';
import { DriverLocationReplayService } from './driver-location-replay.service';
import { DriverLocationHistoryBatchDto } from './dto/driver-location-history-batch.dto';

describe('DriverLocationReplayController', () => {
  const replay = jest.fn();
  const controller = new DriverLocationReplayController({
    replay,
  } as unknown as DriverLocationReplayService);
  const body = {
    points: [
      {
        id: 'point_0123456789abcdef',
        rideId: 'ride-test',
        latitude: -9.44,
        longitude: 147.18,
        recordedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
  };

  beforeEach(() => jest.resetAllMocks());

  it('requires the Driver JWT guard', () => {
    const guards: unknown = Reflect.getMetadata(
      GUARDS_METADATA,
      Object.getOwnPropertyDescriptor(
        DriverLocationReplayController.prototype,
        'replay',
      )?.value as object,
    );
    expect(guards).toContain(DriverJwtAuthGuard);
  });

  it('uses the authenticated driver identity', async () => {
    await controller.replay(body, {
      driver: { id: 'driver-test' },
    } as DriverAuthenticatedRequest);
    expect(replay).toHaveBeenCalledWith(body, 'driver-test');
  });

  it('refuses a request without a driver identity', () => {
    expect(() =>
      controller.replay(body, {} as DriverAuthenticatedRequest),
    ).toThrow(UnauthorizedException);
    expect(replay).not.toHaveBeenCalled();
  });

  it('accepts valid nested points with the production validation settings', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(body, {
        type: 'body',
        metatype: DriverLocationHistoryBatchDto,
      }),
    ).resolves.toBeInstanceOf(DriverLocationHistoryBatchDto);
  });

  it('rejects injected owner and ride-status fields', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    for (const value of [
      { ...body, driverId: 'another-driver' },
      { points: [{ ...body.points[0], status: 'COMPLETED' }] },
      { points: [{ ...body.points[0], latitude: 91 }] },
    ]) {
      await expect(
        pipe.transform(value, {
          type: 'body',
          metatype: DriverLocationHistoryBatchDto,
        }),
      ).rejects.toThrow();
    }
  });
});
