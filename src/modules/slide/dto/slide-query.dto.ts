import { IsString, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination';

export class SlideQueryDto extends PaginationQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'Course ID is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  courseId: string;
}
