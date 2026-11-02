import { IsOptional, IsString, IsISO8601, IsEnum } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination';
import { ClassType } from '../entities/attendance-instance.entity';

export class AttendanceInstanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsISO8601()
  date?: string;

  @IsOptional()
  @IsEnum(ClassType)
  classType?: ClassType;
}

