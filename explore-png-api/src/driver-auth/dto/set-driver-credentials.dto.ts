import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetDriverCredentialsDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
