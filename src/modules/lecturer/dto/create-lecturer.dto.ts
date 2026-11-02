import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateLecturerDto {
  @IsString()
  @IsNotEmpty({ message: 'Lecturer name is required' })
  @Length(2, 100, { message: 'Lecturer name must be between 2 and 100 characters' })
  name: string;

  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Lecturer email is required' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @IsOptional()
  phone?: string;
}

