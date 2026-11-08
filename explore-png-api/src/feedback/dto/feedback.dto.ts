import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FeedbackReviewStatus } from '@prisma/client';

export class SubmitFeedbackDto {
  @IsInt()
  @Min(1)
  @Max(5)
  overallRating!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  customerCareRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  professionalismRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  drivingRating?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  cleanlinessRating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class FeedbackRideParamsDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  rideId!: string;
}

export class FeedbackItemParamsDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  id!: string;
}

export class FeedbackDriverParamsDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  driverId!: string;
}

export class FeedbackListDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  cursor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  driverId?: string;

  @IsOptional()
  @IsEnum(FeedbackReviewStatus)
  status?: FeedbackReviewStatus;
}

export class ReviewFeedbackDto {
  @IsISO8601({ strict: true })
  expectedUpdatedAt!: string;

  @IsEnum(FeedbackReviewStatus)
  expectedStatus!: FeedbackReviewStatus;

  @IsIn([
    FeedbackReviewStatus.REVIEWED,
    FeedbackReviewStatus.FOLLOW_UP,
    FeedbackReviewStatus.CLOSED,
  ])
  status!: FeedbackReviewStatus;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;
}
