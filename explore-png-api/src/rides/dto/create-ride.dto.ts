import { RideType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateRideDto {
  @IsEnum(RideType)
  rideType: RideType;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  serviceZoneId?: string;

  @IsString()
  pickupLabel: string;

  @IsOptional()
  @IsString()
  pickupAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  pickupLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  pickupLongitude?: number;

  @IsOptional()
  @IsString()
  dropoffLabel?: string;

  @IsOptional()
  @IsString()
  dropoffAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  dropoffLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  dropoffLongitude?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedFare?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
