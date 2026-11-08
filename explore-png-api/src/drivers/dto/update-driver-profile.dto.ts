import { PartialType } from '@nestjs/mapped-types';
import { CreateDriverDto } from './create-driver.dto';

export class UpdateDriverProfileDto extends PartialType(CreateDriverDto) {}
