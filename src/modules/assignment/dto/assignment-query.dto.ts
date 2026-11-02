import { IsString, IsNotEmpty } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination';

export class AssignmentQueryDto extends PaginationQueryDto {
  @IsString()
  @IsNotEmpty()
  courseId: string;
}

