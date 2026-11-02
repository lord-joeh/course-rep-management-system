import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsBoolean,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { StudentStatus } from '../entities/student.entity';

export class RepUpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email address is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @IsOptional()
  @IsEnum(StudentStatus, {
    message: 'Status must be one of: active, suspended, pending',
  })
  status?: StudentStatus;

  @IsOptional()
  @IsBoolean()
  isRep?: boolean;
}

