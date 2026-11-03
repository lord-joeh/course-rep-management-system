import { IsOptional, IsString, IsBoolean, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination';
import {
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
} from '../entities/feedback.entity';

export class FeedbackQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @IsOptional()
  @IsEnum(FeedbackPriority)
  priority?: FeedbackPriority;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isAnonymous?: boolean;
}

