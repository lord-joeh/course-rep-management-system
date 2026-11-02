import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsISO8601,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EventType } from '../entities/event.entity';

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(255)
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(EventType)
  @IsOptional()
  eventType?: EventType;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsISO8601()
  @IsOptional()
  startDate?: string;

  @IsISO8601()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  venue?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  meetingLink?: string;

  @IsBoolean()
  @IsOptional()
  allowOverlap?: boolean;

  @IsBoolean()
  @IsOptional()
  updateFutureInSeries?: boolean;
}
