import { BadRequestException } from '@nestjs/common';
import { RideSettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverEarningsService } from './driver-earnings.service';

describe('DriverEarningsService', () => {
  const prismaMock = {
    rideSettlement: {
      findMany: jest.fn(),
    },
  };

  let service: DriverEarningsService;

  beforeEach(() => {
    jest.resetAllMocks();

    service = new DriverEarningsService(prismaMock as unknown as PrismaService);
  });

  it('uses Port Moresby day boundaries and the authenticated Driver ID', async () => {
    prismaMock.rideSettlement.findMany.mockResolvedValue([]);

    const result = await service.getDailyStatement('driver-1', '2026-09-05');

    expect(prismaMock.rideSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          driverId: 'driver-1',

          status: {
            not: RideSettlementStatus.CANCELLED,
          },

          createdAt: {
            gte: new Date('2026-09-04T14:00:00.000Z'),

            lt: new Date('2026-09-05T14:00:00.000Z'),
          },
        },
      }),
    );

    expect(result.range).toEqual({
      from: '2026-09-04T14:00:00.000Z',

      toExclusive: '2026-09-05T14:00:00.000Z',
    });
  });

  it('summarizes Driver takings using stored 80/20 settlements', async () => {
    prismaMock.rideSettlement.findMany.mockResolvedValue([
      {
        receiptNumber: 'RCP-2',

        status: RideSettlementStatus.PAID,

        finalFare: '50.00',

        driverShare: '40.00',

        companyShare: '10.00',

        driverSharePercent: '80.00',

        companySharePercent: '20.00',

        createdAt: new Date('2026-09-05T02:00:00.000Z'),

        ride: {
          id: 'ride-2',

          pickupLabel: 'Boroko',

          pickupAddress: 'Boroko Drive',

          dropoffLabel: 'Waigani',

          dropoffAddress: 'Waigani Drive',

          quotedDistanceMeters: 7200,

          vehicle: {
            id: 'vehicle-1',

            plateNumber: 'PMV-001',

            make: 'Toyota',

            model: 'Camry',

            color: 'White',
          },
        },
      },
      {
        receiptNumber: 'RCP-1',

        status: RideSettlementStatus.PENDING,

        finalFare: '100.00',

        driverShare: '80.00',

        companyShare: '20.00',

        driverSharePercent: '80.00',

        companySharePercent: '20.00',

        createdAt: new Date('2026-09-05T01:00:00.000Z'),

        ride: {
          id: 'ride-1',

          pickupLabel: 'Vision City',

          pickupAddress: 'Waigani Drive',

          dropoffLabel: 'Jacksons Airport',

          dropoffAddress: 'Seven Mile',

          quotedDistanceMeters: 15300,

          vehicle: {
            id: 'vehicle-1',

            plateNumber: 'PMV-001',

            make: 'Toyota',

            model: 'Camry',

            color: 'White',
          },
        },
      },
    ]);

    const result = await service.getDailyStatement('driver-1', '2026-09-05');

    expect(result.summary).toEqual({
      completedTrips: 2,

      grossTakings: 150,

      driverOwnerShare: 120,

      companyShare: 30,

      driverSharePercent: 80,

      companySharePercent: 20,

      pendingReconciliation: 1,

      reconciled: 1,
    });

    expect(result.receipts).toHaveLength(2);

    expect(result.receipts[0]).toEqual(
      expect.objectContaining({
        receiptNumber: 'RCP-2',

        finalFare: 50,

        driverOwnerShare: 40,

        companyShare: 10,

        reconciliationLabel: 'Reconciled',

        distanceKm: 7.2,
      }),
    );
  });

  it('returns an empty statement when the Driver has no completed trips', async () => {
    prismaMock.rideSettlement.findMany.mockResolvedValue([]);

    const result = await service.getDailyStatement('driver-1', '2026-09-05');

    expect(result.summary.completedTrips).toBe(0);
    expect(result.summary.grossTakings).toBe(0);
    expect(result.summary.driverOwnerShare).toBe(0);
    expect(result.summary.companyShare).toBe(0);
    expect(result.receipts).toEqual([]);
  });

  it.each(['05-09-2026', '2026-02-30', 'invalid', ''])(
    'rejects invalid statement date %s',
    async (date) => {
      await expect(
        service.getDailyStatement('driver-1', date),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.rideSettlement.findMany).not.toHaveBeenCalled();
    },
  );
});
