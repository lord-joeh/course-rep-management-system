import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { FeedbackStatus } from '../entities/feedback.entity';

export class UpdateFeedbackStatusDto {
  @IsEnum(FeedbackStatus)
  @IsNotEmpty()
  status: FeedbackStatus;

  @IsString()
  @IsOptional()
  repResponse?: string;
}
