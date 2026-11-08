import { IsNotEmpty, IsString } from 'class-validator';

export class AssignDriverDto {
  @IsString()
  @IsNotEmpty()
  driverId: string;
}
