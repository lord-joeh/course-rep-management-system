import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  FeedbackCategory,
  FeedbackPriority,
} from '../entities/feedback.entity';

export class CreateFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  content: string;

  @IsEnum(FeedbackCategory)
  @IsOptional()
  category?: FeedbackCategory;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;

  @IsEnum(FeedbackPriority)
  @IsOptional()
  priority?: FeedbackPriority;
}

