import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AutomatedGroupDivisionDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsBoolean()
  isGeneral?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  studentsPerGroup?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(100)
  numberOfGroups?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  namingPrefix?: string;

  @IsOptional()
  @IsBoolean()
  autoAssignLeader?: boolean;
}

