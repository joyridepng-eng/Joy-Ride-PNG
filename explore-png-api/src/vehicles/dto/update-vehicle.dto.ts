import { PartialType } from '@nestjs/mapped-types';
import { VehicleStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto';

export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
