import { BadRequestException } from '@nestjs/common';
import { RideStatus } from '@prisma/client';
import { assertRideStatusTransition } from './ride-status.transitions';

describe('assertRideStatusTransition', () => {
  describe('valid transitions', () => {
    const validTransitions: Array<[RideStatus, RideStatus]> = [
      [RideStatus.REQUESTED, RideStatus.ACCEPTED],
      [RideStatus.REQUESTED, RideStatus.CANCELLED],
      [RideStatus.REQUESTED, RideStatus.NO_DRIVER_AVAILABLE],
      [RideStatus.ACCEPTED, RideStatus.DRIVER_ARRIVED],
      [RideStatus.ACCEPTED, RideStatus.CANCELLED],
      [RideStatus.DRIVER_ARRIVED, RideStatus.IN_PROGRESS],
      [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED],
      [RideStatus.IN_PROGRESS, RideStatus.COMPLETED],
      [RideStatus.IN_PROGRESS, RideStatus.CANCELLED],
    ];

    it.each(validTransitions)('allows %s ? %s', (currentStatus, nextStatus) => {
      expect(() =>
        assertRideStatusTransition(currentStatus, nextStatus),
      ).not.toThrow();
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: Array<[RideStatus, RideStatus]> = [
      [RideStatus.REQUESTED, RideStatus.COMPLETED],
      [RideStatus.REQUESTED, RideStatus.IN_PROGRESS],
      [RideStatus.ACCEPTED, RideStatus.COMPLETED],
      [RideStatus.ACCEPTED, RideStatus.REQUESTED],
      [RideStatus.DRIVER_ARRIVED, RideStatus.COMPLETED],
      [RideStatus.IN_PROGRESS, RideStatus.ACCEPTED],
      [RideStatus.COMPLETED, RideStatus.REQUESTED],
      [RideStatus.COMPLETED, RideStatus.CANCELLED],
      [RideStatus.CANCELLED, RideStatus.REQUESTED],
      [RideStatus.NO_DRIVER_AVAILABLE, RideStatus.ACCEPTED],
    ];

    it.each(invalidTransitions)(
      'rejects %s ? %s',
      (currentStatus, nextStatus) => {
        expect(() =>
          assertRideStatusTransition(currentStatus, nextStatus),
        ).toThrow(BadRequestException);
      },
    );

    it('returns a meaningful error message', () => {
      expect(() =>
        assertRideStatusTransition(RideStatus.COMPLETED, RideStatus.REQUESTED),
      ).toThrow('Invalid ride status transition from COMPLETED to REQUESTED');
    });
  });

  describe('terminal statuses', () => {
    const terminalStatuses = [
      RideStatus.COMPLETED,
      RideStatus.CANCELLED,
      RideStatus.NO_DRIVER_AVAILABLE,
    ];

    it.each(terminalStatuses)(
      '%s does not allow another transition',
      (currentStatus) => {
        for (const nextStatus of Object.values(RideStatus)) {
          expect(() =>
            assertRideStatusTransition(currentStatus, nextStatus),
          ).toThrow(BadRequestException);
        }
      },
    );
  });
});
