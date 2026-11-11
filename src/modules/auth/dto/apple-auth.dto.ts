import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AppleUserNameDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}

export class AppleUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUserNameDto)
  name?: AppleUserNameDto;

  @IsOptional()
  @IsString()
  email?: string;
}

export class AppleAuthDto {
  @IsNotEmpty({ message: 'Apple identity token is required' })
  @IsString({ message: 'Apple identity token must be a string' })
  idToken: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUserDto)
  user?: AppleUserDto;
}

