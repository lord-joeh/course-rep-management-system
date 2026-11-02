import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';
import { StudentStatus } from '../entities/student.entity';

export class StudentQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StudentStatus, {
    message: 'Status must be one of: active, suspended, pending',
  })
  status?: StudentStatus;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isRep?: boolean;
}

