import { BadRequestException } from '@nestjs/common';
import { RideStatus } from '@prisma/client';

const allowedTransitions: Record<RideStatus, RideStatus[]> = {
  REQUESTED: [
    RideStatus.ACCEPTED,
    RideStatus.CANCELLED,
    RideStatus.NO_DRIVER_AVAILABLE,
  ],
  ACCEPTED: [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED],
  DRIVER_ARRIVED: [RideStatus.IN_PROGRESS, RideStatus.CANCELLED],
  IN_PROGRESS: [RideStatus.COMPLETED, RideStatus.CANCELLED],
  COMPLETED: [],
  CANCELLED: [],
  NO_DRIVER_AVAILABLE: [],
};

export function assertRideStatusTransition(
  current: RideStatus,
  next: RideStatus,
) {
  const allowedNextStatuses = allowedTransitions[current] ?? [];

  if (!allowedNextStatuses.includes(next)) {
    throw new BadRequestException(
      `Invalid ride status transition from ${current} to ${next}`,
    );
  }
}
