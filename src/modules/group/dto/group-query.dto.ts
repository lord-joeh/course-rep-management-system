import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination';

export class GroupQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isGeneral?: boolean;
}

