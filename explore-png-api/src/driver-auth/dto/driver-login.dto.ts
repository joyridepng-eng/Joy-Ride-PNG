import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class DriverLoginDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must use international format, for example +67570000000',
  })
  phone: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
