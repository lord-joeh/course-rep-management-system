import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ClassType } from '../entities/attendance-instance.entity';

export class InitializeAttendanceDto {
  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsISO8601()
  @IsNotEmpty()
  date: string;

  @IsEnum(ClassType)
  @IsNotEmpty()
  classType: ClassType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(240)
  durationMinutes?: number;
}

