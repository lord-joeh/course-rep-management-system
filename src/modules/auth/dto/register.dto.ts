import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  IsOptional,
  IsBoolean,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Student ID / Index number is required' })
  @Length(4, 50, { message: 'Student ID must be between 4 and 50 characters' })
  id: string;

  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsBoolean()
  @IsOptional()
  isRep?: boolean;
}
