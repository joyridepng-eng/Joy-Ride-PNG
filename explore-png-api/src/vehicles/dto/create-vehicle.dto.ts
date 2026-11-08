import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsOptional()
  @IsString()
  make?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  year?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seatCount?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  chassisNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  registrationNumber?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiresAt?: string;

  @IsString()
  @IsNotEmpty()
  driverId: string;
}
