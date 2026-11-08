import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateDriverAvailabilityDto {
  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
