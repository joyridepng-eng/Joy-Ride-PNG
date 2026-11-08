import { RideStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateRideStatusDto {
  @IsEnum(RideStatus)
  status: RideStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
