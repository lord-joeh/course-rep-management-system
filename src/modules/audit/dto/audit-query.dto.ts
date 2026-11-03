import {
  IsOptional,
  IsEnum,
  IsString,
  IsDateString,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination';
import {
  AuditAction,
  AuditSeverity,
} from '../entities/security-audit-log.entity';

export class AuditQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

