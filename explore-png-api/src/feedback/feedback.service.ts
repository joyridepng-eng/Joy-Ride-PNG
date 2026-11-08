import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FeedbackReviewStatus, Prisma, RideStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FeedbackListDto,
  ReviewFeedbackDto,
  SubmitFeedbackDto,
} from './dto/feedback.dto';

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 5000,
  timeout: 15000,
} as const;

// Rider response deliberately excludes internal review status, notes and actors.
const riderSelect = {
  id: true,
  rideId: true,
  overallRating: true,
  customerCareRating: true,
  professionalismRating: true,
  drivingRating: true,
  cleanlinessRating: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.RideFeedbackSelect;

const adminSelect = {
  ...riderSelect,
  driverId: true,
  reviewStatus: true,
  updatedAt: true,
  driver: { select: { id: true, fullName: true } },
} satisfies Prisma.RideFeedbackSelect;

const adminDetailSelect = {
  ...adminSelect,
  reviewEvents: {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 50,
    select: {
      id: true,
      adminId: true,
      previousStatus: true,
      newStatus: true,
      note: true,
      createdAt: true,
    },
  },
} satisfies Prisma.RideFeedbackSelect;

const transitions: Record<FeedbackReviewStatus, FeedbackReviewStatus[]> = {
  NEW: [
    FeedbackReviewStatus.REVIEWED,
    FeedbackReviewStatus.FOLLOW_UP,
    FeedbackReviewStatus.CLOSED,
  ],
  REVIEWED: [FeedbackReviewStatus.FOLLOW_UP, FeedbackReviewStatus.CLOSED],
  FOLLOW_UP: [FeedbackReviewStatus.REVIEWED, FeedbackReviewStatus.CLOSED],
  CLOSED: [FeedbackReviewStatus.FOLLOW_UP],
};

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(riderId: string, rideId: string, dto: SubmitFeedbackDto) {
    const data = {
      overallRating: dto.overallRating,
      customerCareRating: dto.customerCareRating ?? null,
      professionalismRating: dto.professionalismRating ?? null,
      drivingRating: dto.drivingRating ?? null,
      cleanlinessRating: dto.cleanlinessRating ?? null,
      comment: dto.comment?.trim() || null,
    };
    return this.prisma.$transaction(async (tx) => {
      // Lock the actual ride row: concurrent retries serialize, and ride mutations
      // cannot change its owner/status between the eligibility check and insert.
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Ride" WHERE id = ${rideId} AND "riderId" = ${riderId} FOR UPDATE
      `;
      if (rows.length !== 1) throw new NotFoundException('Ride not found');
      const ride = await tx.ride.findFirst({
        where: { id: rideId, riderId },
        select: { id: true, driverId: true, status: true },
      });
      if (!ride) throw new NotFoundException('Ride not found');
      if (ride.status !== RideStatus.COMPLETED || !ride.driverId) {
        throw new BadRequestException(
          'Feedback requires a completed ride with an assigned driver',
        );
      }
      const saved = await tx.rideFeedback.findUnique({
        where: { rideId },
        select: { ...riderSelect, riderId: true, driverId: true },
      });
      if (saved) {
        const identical =
          saved.riderId === riderId &&
          saved.driverId === ride.driverId &&
          (Object.keys(data) as Array<keyof typeof data>).every(
            (key) => saved[key] === data[key],
          );
        if (!identical)
          throw new ConflictException(
            'Feedback has already been submitted for this ride',
          );
        return tx.rideFeedback.findUniqueOrThrow({
          where: { rideId },
          select: riderSelect,
        });
      }
      return tx.rideFeedback.create({
        data: { ...data, rideId, riderId, driverId: ride.driverId },
        select: riderSelect,
      });
    }, transactionOptions);
  }

  async getMine(riderId: string, rideId: string) {
    const ride = await this.prisma.ride.findFirst({
      where: { id: rideId, riderId },
      select: { id: true },
    });
    if (!ride) throw new NotFoundException('Ride not found');
    return this.prisma.rideFeedback.findFirst({
      where: { rideId, riderId },
      select: riderSelect,
    });
  }

  async listForAdmin(query: FeedbackListDto) {
    const items = await this.prisma.rideFeedback.findMany({
      where: { driverId: query.driverId, reviewStatus: query.status },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: adminSelect,
    });
    const hasMore = items.length > query.limit;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async getForAdmin(id: string) {
    const item = await this.prisma.rideFeedback.findUnique({
      where: { id },
      select: adminDetailSelect,
    });
    if (!item) throw new NotFoundException('Feedback not found');
    return item;
  }

  async review(adminId: string, id: string, dto: ReviewFeedbackDto) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "RideFeedback" WHERE id = ${id} FOR UPDATE
      `;
      if (rows.length !== 1) throw new NotFoundException('Feedback not found');
      const item = await tx.rideFeedback.findUniqueOrThrow({
        where: { id },
        select: { reviewStatus: true, updatedAt: true },
      });
      const note = dto.note.trim();
      if (
        item.reviewStatus !== dto.expectedStatus ||
        item.updatedAt.toISOString() !==
          new Date(dto.expectedUpdatedAt).toISOString()
      ) {
        throw new ConflictException(
          'Feedback review changed; refresh before trying again',
        );
      }
      if (!transitions[item.reviewStatus].includes(dto.status)) {
        throw new BadRequestException('Invalid feedback review transition');
      }
      // Monotonic version token also prevents stale actions after a status cycle.
      const updatedAt = new Date(
        Math.max(Date.now(), item.updatedAt.getTime() + 1),
      );
      await tx.rideFeedback.update({
        where: { id },
        data: { reviewStatus: dto.status, updatedAt },
      });
      await tx.feedbackReviewEvent.create({
        data: {
          feedbackId: id,
          adminId,
          previousStatus: item.reviewStatus,
          newStatus: dto.status,
          note,
          createdAt: updatedAt,
        },
      });
      return tx.rideFeedback.findUniqueOrThrow({
        where: { id },
        select: adminDetailSelect,
      });
    }, transactionOptions);
  }

  async driverSummary(driverId: string) {
    const result = await this.prisma.rideFeedback.aggregate({
      where: { driverId },
      _count: {
        _all: true,
        customerCareRating: true,
        professionalismRating: true,
        drivingRating: true,
        cleanlinessRating: true,
      },
      _avg: {
        overallRating: true,
        customerCareRating: true,
        professionalismRating: true,
        drivingRating: true,
        cleanlinessRating: true,
      },
    });
    const rounded = (value: number | null) =>
      value === null ? null : Math.round(value * 100) / 100;
    // Only aggregate numbers. No ride/rider identifiers, comments or Admin notes.
    return {
      ratingCount: result._count._all,
      overall: {
        average: rounded(result._avg.overallRating),
        count: result._count._all,
      },
      customerCare: {
        average: rounded(result._avg.customerCareRating),
        count: result._count.customerCareRating,
      },
      professionalism: {
        average: rounded(result._avg.professionalismRating),
        count: result._count.professionalismRating,
      },
      driving: {
        average: rounded(result._avg.drivingRating),
        count: result._count.drivingRating,
      },
      cleanliness: {
        average: rounded(result._avg.cleanlinessRating),
        count: result._count.cleanlinessRating,
      },
    };
  }
}
