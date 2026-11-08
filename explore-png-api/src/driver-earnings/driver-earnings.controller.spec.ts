import { UnauthorizedException } from '@nestjs/common';
import type { DriverAuthenticatedRequest } from '../driver-auth/guards/driver-jwt-auth/driver-jwt-auth.guard';
import { DriverEarningsController } from './driver-earnings.controller';
import { DriverEarningsService } from './driver-earnings.service';

describe('DriverEarningsController', () => {
  const serviceMock = {
    getDailyStatement: jest.fn(),
  };

  let controller: DriverEarningsController;

  beforeEach(() => {
    jest.resetAllMocks();

    controller = new DriverEarningsController(
      serviceMock as unknown as DriverEarningsService,
    );
  });

  it('uses only the authenticated Driver identity', async () => {
    serviceMock.getDailyStatement.mockResolvedValue({
      statementDate: '2026-09-05',
    });

    const request = {
      driver: {
        id: 'authenticated-driver',

        fullName: 'Pilot Driver',

        phone: '+67570000002',

        email: null,
      },
    } as unknown as DriverAuthenticatedRequest;

    await controller.getMyDailyStatement(request, '2026-09-05');

    expect(serviceMock.getDailyStatement).toHaveBeenCalledWith(
      'authenticated-driver',
      '2026-09-05',
    );
  });

  it('rejects a request without an authenticated Driver', () => {
    const request = {} as DriverAuthenticatedRequest;

    expect(() => controller.getMyDailyStatement(request, '2026-09-05')).toThrow(
      UnauthorizedException,
    );

    expect(serviceMock.getDailyStatement).not.toHaveBeenCalled();
  });
});
