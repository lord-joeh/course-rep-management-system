import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination';

export class CourseQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  semester?: string;

  @IsOptional()
  @IsString()
  day?: string;

  @IsOptional()
  @IsString()
  lecturerId?: string;
}

