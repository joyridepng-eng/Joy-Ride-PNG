import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  const healthServiceMock = {
    getLiveness: jest.fn(),
    getReadiness: jest.fn(),
  };

  let controller: HealthController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new HealthController(
      healthServiceMock as unknown as HealthService,
    );
  });

  it('uses readiness for the base health endpoint', async () => {
    const expected = {
      status: 'ok',
      service: 'explore-png-api',
      checks: {
        database: 'connected',
      },
      timestamp: '2026-09-08T00:00:00.000Z',
    };

    healthServiceMock.getReadiness.mockResolvedValue(expected);

    await expect(controller.getHealth()).resolves.toEqual(expected);
  });

  it('exposes the explicit readiness endpoint', async () => {
    const expected = {
      status: 'ok',
      service: 'explore-png-api',
      checks: {
        database: 'connected',
      },
      timestamp: '2026-09-08T00:00:00.000Z',
    };

    healthServiceMock.getReadiness.mockResolvedValue(expected);

    await expect(controller.getReadiness()).resolves.toEqual(expected);
  });

  it('exposes liveness without checking the database', () => {
    const expected = {
      status: 'ok',
      service: 'explore-png-api',
      timestamp: '2026-09-08T00:00:00.000Z',
    };

    healthServiceMock.getLiveness.mockReturnValue(expected);

    expect(controller.getLiveness()).toEqual(expected);
    expect(healthServiceMock.getReadiness).not.toHaveBeenCalled();
  });
});
