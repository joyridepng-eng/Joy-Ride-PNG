import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EmergencyAlertStatus } from '@prisma/client';

export class CreateEmergencyDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase() : value,
  )
  @IsUUID('4')
  clientRequestId!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  rideId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  // Location/clock metadata is best effort. The service discards invalid values
  // rather than preventing a genuine alert because GPS or the clock is faulty.
  @Allow()
  location?: unknown;

  @Allow()
  clientOccurredAt?: unknown;
}

export class EmergencyIdParamsDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  id!: string;
}

export class EmergencyListDto {
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
  @IsEnum(EmergencyAlertStatus)
  status?: EmergencyAlertStatus;
}

export class AdminEmergencyListDto extends EmergencyListDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  driverId?: string;
}

export class AcknowledgeEmergencyDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ResolveEmergencyDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  note!: string;
}
