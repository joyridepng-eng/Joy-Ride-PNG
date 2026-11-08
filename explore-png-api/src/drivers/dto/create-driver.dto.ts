import {
  IsDateString,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateDriverDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  licenseClass?: string;

  @IsOptional()
  @IsDateString()
  licenseIssuedAt?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiresAt?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  emergencyContactRelationship?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  serviceZoneId?: string;
}
