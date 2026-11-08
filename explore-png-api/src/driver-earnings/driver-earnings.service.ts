import { BadRequestException, Injectable } from '@nestjs/common';
import { RideSettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PORT_MORESBY_OFFSET_MS = 10 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class DriverEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDailyStatement(driverId: string, requestedDate?: string) {
    const statementDate = requestedDate ?? this.getCurrentPortMoresbyDate();

    const range = this.resolvePortMoresbyDay(statementDate);

    const settlements = await this.prisma.rideSettlement.findMany({
      where: {
        driverId,
        status: {
          not: RideSettlementStatus.CANCELLED,
        },
        createdAt: {
          gte: range.from,
          lt: range.to,
        },
      },
      select: {
        receiptNumber: true,
        status: true,
        finalFare: true,
        driverShare: true,
        companyShare: true,
        driverSharePercent: true,
        companySharePercent: true,
        createdAt: true,
        ride: {
          select: {
            id: true,
            pickupLabel: true,
            pickupAddress: true,
            dropoffLabel: true,
            dropoffAddress: true,
            quotedDistanceMeters: true,
            vehicle: {
              select: {
                id: true,
                plateNumber: true,
                make: true,
                model: true,
                color: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const grossTakings = this.roundMoney(
      settlements.reduce(
        (total, settlement) => total + Number(settlement.finalFare),
        0,
      ),
    );

    const driverOwnerShare = this.roundMoney(
      settlements.reduce(
        (total, settlement) => total + Number(settlement.driverShare),
        0,
      ),
    );

    const companyShare = this.roundMoney(
      settlements.reduce(
        (total, settlement) => total + Number(settlement.companyShare),
        0,
      ),
    );

    const pendingReconciliation = settlements.filter(
      (settlement) => settlement.status === RideSettlementStatus.PENDING,
    ).length;

    const reconciled = settlements.filter(
      (settlement) => settlement.status === RideSettlementStatus.PAID,
    ).length;

    const currentDate = this.getCurrentPortMoresbyDate();

    return {
      statementNumber: this.generateStatementNumber(statementDate, driverId),

      statementDate,

      timezone: 'Pacific/Port_Moresby',

      statementStatus: statementDate === currentDate ? 'PROVISIONAL' : 'FINAL',

      range: {
        from: range.from.toISOString(),

        toExclusive: range.to.toISOString(),
      },

      generatedAt: new Date().toISOString(),

      summary: {
        completedTrips: settlements.length,

        grossTakings,

        driverOwnerShare,

        companyShare,

        driverSharePercent: 80,

        companySharePercent: 20,

        pendingReconciliation,

        reconciled,
      },

      receipts: settlements.map((settlement) => ({
        receiptNumber: settlement.receiptNumber,

        rideId: settlement.ride.id,

        completedAt: settlement.createdAt.toISOString(),

        reconciliationStatus: settlement.status,

        reconciliationLabel: this.getReconciliationLabel(settlement.status),

        finalFare: Number(settlement.finalFare),

        driverOwnerShare: Number(settlement.driverShare),

        companyShare: Number(settlement.companyShare),

        driverSharePercent: Number(settlement.driverSharePercent),

        companySharePercent: Number(settlement.companySharePercent),

        distanceKm:
          settlement.ride.quotedDistanceMeters === null
            ? null
            : Number((settlement.ride.quotedDistanceMeters / 1000).toFixed(2)),

        pickup: {
          label: settlement.ride.pickupLabel,

          address: settlement.ride.pickupAddress,
        },

        dropoff: {
          label: settlement.ride.dropoffLabel,

          address: settlement.ride.dropoffAddress,
        },

        vehicle: settlement.ride.vehicle,
      })),
    };
  }

  private resolvePortMoresbyDay(dateText: string) {
    if (!DATE_PATTERN.test(dateText)) {
      throw new BadRequestException(
        'The statement date must use YYYY-MM-DD format',
      );
    }

    const [yearText, monthText, dayText] = dateText.split('-');

    const year = Number(yearText);

    const month = Number(monthText);

    const day = Number(dayText);

    const localStartMs = Date.UTC(year, month - 1, day);

    const validationDate = new Date(localStartMs);

    if (
      validationDate.getUTCFullYear() !== year ||
      validationDate.getUTCMonth() !== month - 1 ||
      validationDate.getUTCDate() !== day
    ) {
      throw new BadRequestException('The statement date is invalid');
    }

    const from = new Date(localStartMs - PORT_MORESBY_OFFSET_MS);

    return {
      from,

      to: new Date(from.getTime() + ONE_DAY_MS),
    };
  }

  private getCurrentPortMoresbyDate(): string {
    return new Date(Date.now() + PORT_MORESBY_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
  }

  private generateStatementNumber(
    statementDate: string,
    driverId: string,
  ): string {
    const compactDate = statementDate.replaceAll('-', '');

    const driverReference = driverId
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-6)
      .toUpperCase()
      .padStart(6, '0');

    return `JR-DAILY-${compactDate}-` + driverReference;
  }

  private getReconciliationLabel(status: RideSettlementStatus): string {
    switch (status) {
      case RideSettlementStatus.PAID:
        return 'Reconciled';

      case RideSettlementStatus.CANCELLED:
        return 'Cancelled';

      case RideSettlementStatus.PENDING:
      default:
        return 'Pending reconciliation';
    }
  }

  private roundMoney(value: number): number {
    return Number(value.toFixed(2));
  }
}
