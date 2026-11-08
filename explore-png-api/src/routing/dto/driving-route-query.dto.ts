import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsNumber } from 'class-validator';

export class DrivingRouteQueryDto {
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  originLatitude: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  originLongitude: number;

  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  destinationLatitude: number;

  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  destinationLongitude: number;
}
