import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadSlideDto {
  @IsString()
  @IsNotEmpty({ message: 'Course ID is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  courseId: string;

  @IsString()
  @IsOptional()
  folderId?: string;
}

