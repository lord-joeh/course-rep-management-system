import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsISO8601,
  IsInt,
  Min,
  Max,
  IsArray,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EventType, RecurrenceFrequency } from '../entities/event.entity';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  title: string;

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
  @IsNotEmpty()
  startDate: string;

  @IsISO8601()
  @IsNotEmpty()
  endDate: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  venue: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  meetingLink?: string;

  @IsBoolean()
  @IsOptional()
  allowOverlap?: boolean;

  // Recurring Event Engine
  @IsBoolean()
  @IsOptional()
  isRecurring?: boolean;

  @IsEnum(RecurrenceFrequency)
  @IsOptional()
  recurrenceFrequency?: RecurrenceFrequency;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  recurrenceInterval?: number;

  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  recurrenceDaysOfWeek?: number[];

  @IsISO8601()
  @IsOptional()
  recurrenceEndDate?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  @IsOptional()
  recurrenceCount?: number;
}
