import { IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination';

export class StudentSubmissionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  assignmentId?: string;
}

