import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RiderRegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must use international format, for example +67570000000',
  })
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
