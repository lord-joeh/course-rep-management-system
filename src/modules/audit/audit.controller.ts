import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
} from '@nestjs/common';
import { AuditService, AuditIntegrityReport, AuditDashboardStats } from './audit.service';
import { SecurityAuditLog } from './entities/security-audit-log.entity';
import { AuditQueryDto } from './dto';
import { Roles, UserRole } from '../../common/decorators/roles.decorator';
import { PaginatedResult } from '../../common/pagination';

@Controller('audit-logs')
@Roles(UserRole.REP)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * List paginated audit events with multi-criteria filtering.
   */
  @Get()
  async getLogs(
    @Query() query: AuditQueryDto,
  ): Promise<PaginatedResult<SecurityAuditLog>> {
    return this.auditService.getLogs(query);
  }

  /**
   * Retrieve aggregate operational metrics for security dashboard.
   */
  @Get('stats')
  async getStats(): Promise<AuditDashboardStats> {
    return this.auditService.getStats();
  }

  /**
   * Retrieve recent critical and high severity security incidents.
   */
  @Get('recent-alerts')
  async getRecentAlerts(
    @Query('limit') limit?: number,
  ): Promise<SecurityAuditLog[]> {
    return this.auditService.getRecentAlerts(limit ? Number(limit) : 20);
  }

  /**
   * Run cryptographic verification across the audit hash chain.
   */
  @Post('verify-integrity')
  async verifyIntegrity(
    @Body('fromSeq') fromSeq?: number,
    @Body('toSeq') toSeq?: number,
  ): Promise<AuditIntegrityReport> {
    return this.auditService.verifyIntegrity({ fromSeq, toSeq });
  }

  /**
   * Inspect a specific audit record by ID.
   */
  @Get(':id')
  async getLogById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SecurityAuditLog> {
    return this.auditService.getLogById(id);
  }
}

