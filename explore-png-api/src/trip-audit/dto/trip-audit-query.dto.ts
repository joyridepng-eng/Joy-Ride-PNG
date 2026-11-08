import { RideStatus } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum TripAuditPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  CUSTOM = 'custom',
}

export class TripAuditQueryDto {
  @IsOptional()
  @IsEnum(TripAuditPeriod)
  period: TripAuditPeriod = TripAuditPeriod.DAILY;

  @IsOptional()
  @IsISO8601()
  anchor?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  driverId?: string;

  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;
}
