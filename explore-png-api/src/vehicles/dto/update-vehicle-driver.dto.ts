import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateVehicleDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId: string;
}
