import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateVehicleDto } from './create-vehicle.dto';

export class UpdateVehicleProfileDto extends PartialType(
  OmitType(CreateVehicleDto, ['driverId'] as const),
) {}
