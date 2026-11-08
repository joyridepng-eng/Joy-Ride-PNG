import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DriverStatus, RideStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriversService } from './drivers.service';

function setup(activeStatus: RideStatus | null, found = true) {
  const driver = {
    id: 'test-driver',
    status: DriverStatus.APPROVED,
    isOnline: true,
    isAvailable: true,
  };
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    driver: {
      findUnique: jest.fn().mockResolvedValue(found ? driver : null),
      update: jest.fn().mockResolvedValue({ ...driver, isOnline: false }),
    },
    ride: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          activeStatus ? { id: 'test-ride', status: activeStatus } : null,
        ),
    },
    vehicle: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    ),
  };
  const service = new DriversService(prisma as unknown as PrismaService);
  return { tx, service };
}

describe('Driver suspension and deactivation', () => {
  const actions = [DriverStatus.SUSPENDED, DriverStatus.INACTIVE] as const;
  const activeStages = [
    RideStatus.ACCEPTED,
    RideStatus.DRIVER_ARRIVED,
    RideStatus.IN_PROGRESS,
  ] as const;

  describe.each(actions)('%s', (status) => {
    it.each(activeStages)(
      'blocks status endpoint during %s without mutations',
      async (activeStatus) => {
        const { tx, service } = setup(activeStatus);
        await expect(
          service.updateStatus('test-driver', status),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.$executeRaw).toHaveBeenCalled();
        expect(tx.driver.update).not.toHaveBeenCalled();
        expect(tx.vehicle.updateMany).not.toHaveBeenCalled();
      },
    );

    it.each(activeStages)(
      'blocks profile update bypass during %s without mutations',
      async (activeStatus) => {
        const { tx, service } = setup(activeStatus);
        await expect(
          service.update('test-driver', { status }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(tx.$executeRaw).toHaveBeenCalled();
        expect(tx.driver.update).not.toHaveBeenCalled();
        expect(tx.vehicle.updateMany).not.toHaveBeenCalled();
      },
    );

    it('allows an idle driver status change and deactivates vehicles', async () => {
      const { tx, service } = setup(null);
      await service.updateStatus('test-driver', status);
      expect(tx.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'test-driver' },
          data: expect.objectContaining({
            status,
            isOnline: false,
            isAvailable: false,
          }) as unknown,
        }) as unknown,
      );
      expect(tx.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          driverId: 'test-driver',
          status: VehicleStatus.ACTIVE,
        },
        data: { status: VehicleStatus.INACTIVE },
      });
    });

    it('allows an idle profile status change and forces offline', async () => {
      const { tx, service } = setup(null);
      await service.update('test-driver', { status });
      expect(tx.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status,
            isOnline: false,
            isAvailable: false,
          }) as unknown,
        }) as unknown,
      );
    });
  });

  it('retains not-found handling without mutations', async () => {
    const { tx, service } = setup(null, false);
    await expect(
      service.updateStatus('missing-driver', DriverStatus.SUSPENDED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.driver.update).not.toHaveBeenCalled();
    expect(tx.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('preserves ordinary profile editing during an active ride', async () => {
    const { tx, service } = setup(RideStatus.IN_PROGRESS);
    await service.update('test-driver', {});
    expect(tx.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isAvailable: false }) as unknown,
      }) as unknown,
    );
    expect(tx.vehicle.updateMany).not.toHaveBeenCalled();
  });
});
