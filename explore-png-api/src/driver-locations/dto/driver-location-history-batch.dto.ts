import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class DriverLocationHistoryPointDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{16,100}$/)
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  rideId: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(359.999999)
  heading?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number;

  @IsISO8601({ strict: true })
  recordedAt: string;
}

export class DriverLocationHistoryBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DriverLocationHistoryPointDto)
  points: DriverLocationHistoryPointDto[];
}
