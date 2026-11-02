import {
  IsString,
  IsOptional,
  IsUUID,
  Length,
} from 'class-validator';

export class UpdateCourseDto {
  @IsString()
  @IsOptional()
  @Length(2, 200, { message: 'Course name must be between 2 and 200 characters' })
  name?: string;

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
  @IsOptional()
  semester?: string;

  @IsString()
  @IsOptional()
  slidesFolderId?: string;
}

