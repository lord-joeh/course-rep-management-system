import { IsOptional, IsString, IsBoolean, IsISO8601, IsEnum, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination';
import { EventType } from '../entities/event.entity';

export class EventQueryDto extends PaginationQueryDto {
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
  isGeneral?: boolean;

  @IsOptional()
  @IsEnum(EventType)
  eventType?: EventType;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  upcomingOnly?: boolean;

  @IsOptional()
  @IsUUID()
  recurrenceSeriesId?: string;
}
