import { VehicleStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateVehicleStatusDto {
  @IsEnum(VehicleStatus)
  status: VehicleStatus;
}
