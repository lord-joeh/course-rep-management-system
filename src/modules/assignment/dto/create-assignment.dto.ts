import { IsString, IsNotEmpty, MaxLength, IsISO8601 } from 'class-validator';

export class CreateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsISO8601()
  @IsNotEmpty()
  deadline: string;
}

