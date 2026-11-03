import {
  IsEnum,
  IsOptional,
  IsString,
  IsObject,
} from 'class-validator';
import {
  AuditAction,
  AuditSeverity,
  AuditResource,
} from '../entities/security-audit-log.entity';

export class CreateAuditLogDto {
  @IsEnum(AuditAction)
  action: AuditAction;

  @IsOptional()
  @IsEnum(AuditSeverity)
  severity?: AuditSeverity;

  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  @IsString()
  resourceId?: string;

  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  actorRole?: string;

  @IsOptional()
  @IsString()
  actorEmail?: string;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, any>;
}

