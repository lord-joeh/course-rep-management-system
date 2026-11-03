import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

import {
  SecurityAuditLog,
  AuditAction,
  AuditSeverity,
  AuditResource,
} from './entities/security-audit-log.entity';
import { CreateAuditLogDto, AuditQueryDto } from './dto';
import { CacheService } from '../redis/cache.service';
import { PaginatedResult } from '../../common/pagination';

export interface AuditIntegrityReport {
  isIntact: boolean;
  totalVerified: number;
  unbrokenChainLength: number;
  genesisHashValid: boolean;
  verifiedAt: Date;
  errors: string[];
}

export interface AuditDashboardStats {
  totalLogs: number;
  severityCounts: Record<AuditSeverity, number>;
  failedLoginsLast24h: number;
  geofenceBreachesLast24h: number;
  recentHighSeverityCount: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly hmacSecret: string;
  private readonly genesisHash = '0'.repeat(64);

  constructor(
    @InjectRepository(SecurityAuditLog)
    private readonly auditRepository: Repository<SecurityAuditLog>,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.hmacSecret =
      this.configService.get<string>('audit.hmacSecret') ||
      process.env.AUDIT_HMAC_SECRET ||
      'enterprise_audit_hmac_secret_sha256_minimum_32_characters';
  }

  /**
   * Deterministic HMAC-SHA256 signature generator.
   */
  computeHash(canonicalPayload: string): string {
    return crypto
      .createHmac('sha256', this.hmacSecret)
      .update(canonicalPayload)
      .digest('hex');
  }

  /**
   * Constructs the immutable canonical payload for hash computation.
   */
  buildCanonicalPayload(
    sequenceNumber: number,
    timestamp: Date,
    actorId: string | null,
    actorRole: string,
    action: string,
    severity: string,
    resource: string,
    resourceId: string | null,
    ipAddress: string,
    details: Record<string, any>,
    previousHash: string,
  ): string {
    const formattedDate = timestamp instanceof Date ? timestamp.toISOString() : new Date(timestamp).toISOString();
    const sortedDetails = JSON.stringify(details || {}, Object.keys(details || {}).sort());
    return `${sequenceNumber}|${formattedDate}|${actorId || ''}|${actorRole}|${action}|${severity}|${resource}|${resourceId || ''}|${ipAddress}|${sortedDetails}|${previousHash}`;
  }

  /**
   * Append a tamper-evident audit log to the cryptographic hash chain.
   */
  async recordEvent(dto: CreateAuditLogDto): Promise<SecurityAuditLog> {
    const lockKey = 'cr:lock:audit-chain';
    let lockAcquired = false;

    // Concurrency protection: Acquire distributed mutex to ensure strict sequential chaining
    for (let attempt = 0; attempt < 5; attempt++) {
      lockAcquired = await this.cacheService.setNx(lockKey, 'locked', 10);
      if (lockAcquired) break;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }

    try {
      // Find the most recent record in the chain
      const lastRecord = await this.auditRepository.findOne({
        where: {},
        order: { sequenceNumber: 'DESC' },
      });

      let sequenceNumber = 1;
      let previousHash = this.genesisHash;

      if (lastRecord) {
        sequenceNumber = Number(lastRecord.sequenceNumber) + 1;
        previousHash = lastRecord.currentHash;
      }

      const timestamp = new Date();
      const actorId = dto.actorId || null;
      const actorRole = dto.actorRole || 'ANONYMOUS';
      const actorEmail = dto.actorEmail || null;
      const action = dto.action;
      const severity = dto.severity || AuditSeverity.INFO;
      const resource = dto.resource || AuditResource.SYSTEM;
      const resourceId = dto.resourceId || null;
      const ipAddress = dto.ipAddress || '127.0.0.1';
      const userAgent = dto.userAgent || null;
      const details = dto.details || {};

      const canonicalPayload = this.buildCanonicalPayload(
        sequenceNumber,
        timestamp,
        actorId,
        actorRole,
        action,
        severity,
        resource,
        resourceId,
        ipAddress,
        details,
        previousHash,
      );

      const currentHash = this.computeHash(canonicalPayload);

      const log = this.auditRepository.create({
        sequenceNumber,
        timestamp,
        actorId,
        actorRole,
        actorEmail,
        action,
        severity,
        resource,
        resourceId,
        ipAddress,
        userAgent,
        details,
        previousHash,
        currentHash,
      });

      const saved = await this.auditRepository.save(log);

      // Invalidate audit summary cache
      await this.cacheService.del('cr:audit:stats');

      this.logger.log(
        `Audit record [Seq #${saved.sequenceNumber}] logged: [${saved.action}] (${saved.severity}) by actor [${saved.actorId || 'anon'}]`,
      );

      return saved;
    } catch (error: any) {
      this.logger.error(`Failed to record audit event: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to securely record audit event');
    } finally {
      if (lockAcquired) {
        await this.cacheService.del(lockKey);
      }
    }
  }

  /**
   * Search and filter audit records with pagination.
   */
  async getLogs(query: Partial<AuditQueryDto>): Promise<PaginatedResult<SecurityAuditLog>> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const qb = this.auditRepository.createQueryBuilder('audit');

    if (query.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }

    if (query.severity) {
      qb.andWhere('audit.severity = :severity', { severity: query.severity });
    }

    if (query.resource) {
      qb.andWhere('audit.resource = :resource', { resource: query.resource });
    }

    if (query.actorId) {
      qb.andWhere('audit.actorId = :actorId', { actorId: query.actorId });
    }

    if (query.startDate && query.endDate) {
      qb.andWhere('audit.timestamp BETWEEN :start AND :end', {
        start: new Date(query.startDate),
        end: new Date(query.endDate),
      });
    } else if (query.startDate) {
      qb.andWhere('audit.timestamp >= :start', {
        start: new Date(query.startDate),
      });
    } else if (query.endDate) {
      qb.andWhere('audit.timestamp <= :end', {
        end: new Date(query.endDate),
      });
    }

    if (query.search && query.search.trim()) {
      qb.andWhere(
        '(audit.actorEmail ILIKE :search OR audit.ipAddress ILIKE :search OR audit.resourceId ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    qb.orderBy('audit.sequenceNumber', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Retrieve single audit log by ID.
   */
  async getLogById(id: string): Promise<SecurityAuditLog> {
    const log = await this.auditRepository.findOne({ where: { id } });
    if (!log) {
      throw new NotFoundException(`Audit log "${id}" not found`);
    }
    return log;
  }

  /**
   * Recent high and critical severity alerts.
   */
  async getRecentAlerts(limit: number = 20): Promise<SecurityAuditLog[]> {
    return this.auditRepository.find({
      where: {
        severity: In([AuditSeverity.HIGH, AuditSeverity.CRITICAL]),
      },
      order: { sequenceNumber: 'DESC' },
      take: limit,
    });
  }

  /**
   * Audit Dashboard operational metrics.
   */
  async getStats(): Promise<AuditDashboardStats> {
    const cached = await this.cacheService.get<AuditDashboardStats>('cr:audit:stats');
    if (cached) return cached;

    const totalLogs = await this.auditRepository.count();

    const severityCounts: Record<AuditSeverity, number> = {
      [AuditSeverity.INFO]: await this.auditRepository.count({ where: { severity: AuditSeverity.INFO } }),
      [AuditSeverity.LOW]: await this.auditRepository.count({ where: { severity: AuditSeverity.LOW } }),
      [AuditSeverity.MEDIUM]: await this.auditRepository.count({ where: { severity: AuditSeverity.MEDIUM } }),
      [AuditSeverity.HIGH]: await this.auditRepository.count({ where: { severity: AuditSeverity.HIGH } }),
      [AuditSeverity.CRITICAL]: await this.auditRepository.count({ where: { severity: AuditSeverity.CRITICAL } }),
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const failedLoginsLast24h = await this.auditRepository.count({
      where: {
        action: AuditAction.LOGIN_FAILURE,
        timestamp: MoreThanOrEqual(oneDayAgo),
      },
    });

    const geofenceBreachesLast24h = await this.auditRepository.count({
      where: {
        action: AuditAction.ATTENDANCE_GEOFENCE_BREACH,
        timestamp: MoreThanOrEqual(oneDayAgo),
      },
    });

    const recentHighSeverityCount = severityCounts[AuditSeverity.HIGH] + severityCounts[AuditSeverity.CRITICAL];

    const stats: AuditDashboardStats = {
      totalLogs,
      severityCounts,
      failedLoginsLast24h,
      geofenceBreachesLast24h,
      recentHighSeverityCount,
    };

    await this.cacheService.set('cr:audit:stats', stats, 60);
    return stats;
  }

  /**
   * Cryptographic verification engine.
   * Walks the entire sequence, verifies monotonic sequences, and re-computes HMAC-SHA256 signatures.
   */
  async verifyIntegrity(options?: { fromSeq?: number; toSeq?: number }): Promise<AuditIntegrityReport> {
    const qb = this.auditRepository.createQueryBuilder('audit').orderBy('audit.sequenceNumber', 'ASC');

    if (options?.fromSeq) {
      qb.andWhere('audit.sequenceNumber >= :fromSeq', { fromSeq: options.fromSeq });
    }
    if (options?.toSeq) {
      qb.andWhere('audit.sequenceNumber <= :toSeq', { toSeq: options.toSeq });
    }

    const logs = await qb.getMany();
    const errors: string[] = [];

    if (logs.length === 0) {
      return {
        isIntact: true,
        totalVerified: 0,
        unbrokenChainLength: 0,
        genesisHashValid: true,
        verifiedAt: new Date(),
        errors: [],
      };
    }

    let unbrokenChainLength = 0;
    let expectedPreviousHash = options?.fromSeq && options.fromSeq > 1 ? logs[0].previousHash : this.genesisHash;
    let expectedSeqNumber = options?.fromSeq || 1;

    for (let i = 0; i < logs.length; i++) {
      const record = logs[i];
      const seq = Number(record.sequenceNumber);

      // 1. Verify sequence continuity (Detects deleted rows)
      if (seq !== expectedSeqNumber) {
        errors.push(
          `Sequence Gap Detected: Expected sequence #${expectedSeqNumber}, but found sequence #${seq}. Indicates row deletion or insertion.`,
        );
      }

      // 2. Verify previousHash continuity (Detects swapped or spliced blocks)
      if (record.previousHash !== expectedPreviousHash) {
        errors.push(
          `Hash Chain Break at sequence #${seq}: Previous hash [${record.previousHash.slice(0, 12)}...] does not match expected parent hash [${expectedPreviousHash.slice(0, 12)}...].`,
        );
      }

      // 3. Recompute canonical HMAC signature (Detects tampered data fields)
      const canonicalPayload = this.buildCanonicalPayload(
        seq,
        record.timestamp,
        record.actorId,
        record.actorRole,
        record.action,
        record.severity,
        record.resource,
        record.resourceId,
        record.ipAddress,
        record.details,
        record.previousHash,
      );

      const calculatedHash = this.computeHash(canonicalPayload);

      if (calculatedHash !== record.currentHash) {
        errors.push(
          `Tampered Record Detected at sequence #${seq}: Stored hash [${record.currentHash.slice(0, 12)}...] does not match computed signature [${calculatedHash.slice(0, 12)}...]. Record content has been modified.`,
        );
      }

      if (errors.length === 0) {
        unbrokenChainLength++;
      }

      expectedPreviousHash = record.currentHash;
      expectedSeqNumber = seq + 1;
    }

    const isIntact = errors.length === 0;

    this.logger.log(
      `Audit integrity verification completed: ${logs.length} logs verified, unbroken chain length: ${unbrokenChainLength}, intact: ${isIntact}`,
    );

    return {
      isIntact,
      totalVerified: logs.length,
      unbrokenChainLength,
      genesisHashValid: logs[0].previousHash === this.genesisHash || Boolean(options?.fromSeq),
      verifiedAt: new Date(),
      errors,
    };
  }
}

