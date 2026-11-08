import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ServiceStatus, ServiceZoneKind } from '@prisma/client';

export class CreateServiceZoneDto {
  @IsString()
  name: string;

  @IsString()
  locationId: string;

  @IsOptional()
  @IsEnum(ServiceStatus)
  serviceStatus?: ServiceStatus;

  @IsOptional()
  @IsEnum(ServiceZoneKind)
  zoneKind?: ServiceZoneKind;

  @IsOptional()
  @IsBoolean()
  isAirportZone?: boolean;

  @IsOptional()
  @IsBoolean()
  isHotelZone?: boolean;

  @IsOptional()
  @IsBoolean()
  isPeripheryBuffer?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  centerLatitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  centerLongitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  coverageRadiusKm?: number;
}
