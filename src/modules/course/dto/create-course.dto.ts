import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCourseDto {
  @IsString()
  @IsNotEmpty({ message: 'Course ID/code is required (e.g., CPEN401)' })
  @Length(2, 50, { message: 'Course ID must be between 2 and 50 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  id: string;

  @IsString()
  @IsNotEmpty({ message: 'Course name is required' })
  @Length(2, 200, { message: 'Course name must be between 2 and 200 characters' })
  name: string;

  @IsUUID('4', { message: 'lecturerId must be a valid UUID' })
  @IsOptional()
  lecturerId?: string;

  @IsString()
  @IsOptional()
  day?: string;

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsNotEmpty({ message: 'Semester is required' })
  semester: string;

  @IsString()
  @IsOptional()
  slidesFolderId?: string;
}

