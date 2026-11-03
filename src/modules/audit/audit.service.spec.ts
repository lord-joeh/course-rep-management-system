import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, InternalServerErrorException } from '@nestjs/common';
import * as crypto from 'crypto';

import { AuditService } from './audit.service';
import {
  SecurityAuditLog,
  AuditAction,
  AuditSeverity,
  AuditResource,
} from './entities/security-audit-log.entity';
import { CacheService } from '../redis/cache.service';
import { CreateAuditLogDto } from './dto';

describe('AuditService', () => {
  let service: AuditService;
  let auditRepoMock: any;
  let configServiceMock: any;
  let cacheServiceMock: any;
  let queryBuilderMock: any;

  const testHmacSecret = 'test_audit_hmac_secret_32_characters_minimum';
  const genesisHash = '0'.repeat(64);

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    };

    auditRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) =>
        Promise.resolve({
          id: 'log-uuid-1',
          ...entity,
        }),
      ),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'audit.hmacSecret') return testHmacSecret;
        return null;
      }),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      setNx: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(SecurityAuditLog),
          useValue: auditRepoMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('computeHash and buildCanonicalPayload', () => {
    it('should deterministically generate HMAC-SHA256 signature', () => {
      const payload = '1|2026-11-03T12:00:00.000Z|actor-1|STUDENT|LOGIN_SUCCESS|INFO|AUTH||127.0.0.1|{}|' + genesisHash;
      const hash1 = service.computeHash(payload);
      const hash2 = service.computeHash(payload);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);

      const expected = crypto
        .createHmac('sha256', testHmacSecret)
        .update(payload)
        .digest('hex');
      expect(hash1).toBe(expected);
    });

    it('should build canonical payload with sorted JSON details and ISO timestamp', () => {
      const date = new Date('2026-11-03T12:00:00.000Z');
      const canonical = service.buildCanonicalPayload(
        1,
        date,
        'actor-1',
        'STUDENT',
        'LOGIN_SUCCESS',
        'INFO',
        'AUTH',
        'res-1',
        '192.168.1.1',
        { z: 1, a: 2 },
        genesisHash,
      );

      expect(canonical).toContain('1|2026-11-03T12:00:00.000Z|actor-1|STUDENT|LOGIN_SUCCESS|INFO|AUTH|res-1|192.168.1.1|');
      expect(canonical).toContain(genesisHash);
    });
  });

  describe('recordEvent', () => {
    it('should create Genesis record when table is empty', async () => {
      auditRepoMock.findOne.mockResolvedValue(null);

      const dto: CreateAuditLogDto = {
        action: AuditAction.LOGIN_SUCCESS,
        actorId: 'student-1',
        actorRole: 'STUDENT',
        resource: AuditResource.AUTH,
      };

      const result = await service.recordEvent(dto);

      expect(cacheServiceMock.setNx).toHaveBeenCalledWith('cr:lock:audit-chain', 'locked', 10);
      expect(auditRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sequenceNumber: 1,
          previousHash: genesisHash,
          action: AuditAction.LOGIN_SUCCESS,
          severity: AuditSeverity.INFO,
          resource: AuditResource.AUTH,
        }),
      );
      expect(result.currentHash).toHaveLength(64);
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:lock:audit-chain');
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:audit:stats');
    });

    it('should link to previous record currentHash and increment sequenceNumber', async () => {
      const lastRecord = {
        id: 'log-1',
        sequenceNumber: 42,
        currentHash: 'a'.repeat(64),
      };
      auditRepoMock.findOne.mockResolvedValue(lastRecord);

      const dto: CreateAuditLogDto = {
        action: AuditAction.ATTENDANCE_MARKED,
        severity: AuditSeverity.INFO,
        resource: AuditResource.ATTENDANCE,
        resourceId: 'inst-1',
        actorId: 'student-2',
      };

      const result = await service.recordEvent(dto);

      expect(auditRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          sequenceNumber: 43,
          previousHash: 'a'.repeat(64),
          action: AuditAction.ATTENDANCE_MARKED,
        }),
      );
      expect(result.currentHash).toBeDefined();
    });

    it('should retry acquiring distributed lock if initially locked', async () => {
      cacheServiceMock.setNx
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      auditRepoMock.findOne.mockResolvedValue(null);

      const result = await service.recordEvent({ action: AuditAction.SYSTEM_ALERT });

      expect(cacheServiceMock.setNx).toHaveBeenCalledTimes(2);
      expect(result.sequenceNumber).toBe(1);
    });

    it('should throw InternalServerErrorException and release lock if repository fails', async () => {
      auditRepoMock.findOne.mockRejectedValue(new Error('Database disconnected'));

      await expect(
        service.recordEvent({ action: AuditAction.LOGIN_FAILURE }),
      ).rejects.toThrow(InternalServerErrorException);

      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:lock:audit-chain');
    });
  });

  describe('getLogs', () => {
    it('should return paginated audit logs with all query filters applied', async () => {
      const mockLogs = [{ id: '1', sequenceNumber: 1 }];
      queryBuilderMock.getManyAndCount.mockResolvedValue([mockLogs, 1]);

      const result = await service.getLogs({
        page: 2,
        limit: 10,
        action: AuditAction.LOGIN_SUCCESS,
        severity: AuditSeverity.INFO,
        resource: AuditResource.AUTH,
        actorId: 'student-1',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        search: 'student@uni.edu',
      });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('audit.action = :action', { action: AuditAction.LOGIN_SUCCESS });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('audit.severity = :severity', { severity: AuditSeverity.INFO });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('audit.resource = :resource', { resource: AuditResource.AUTH });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith('audit.actorId = :actorId', { actorId: 'student-1' });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(expect.stringContaining('BETWEEN'), expect.any(Object));
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), expect.any(Object));
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(10);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(10);
      expect(result.items).toEqual(mockLogs);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBe(1);
    });

    it('should handle single startDate or endDate filters', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      await service.getLogs({ startDate: '2026-11-01' });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'audit.timestamp >= :start',
        expect.any(Object),
      );

      jest.clearAllMocks();
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);
      await service.getLogs({ endDate: '2026-11-03' });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'audit.timestamp <= :end',
        expect.any(Object),
      );
    });
  });

  describe('getLogById', () => {
    it('should throw NotFoundException if audit log does not exist', async () => {
      auditRepoMock.findOne.mockResolvedValue(null);
      await expect(service.getLogById('missing-uuid')).rejects.toThrow(NotFoundException);
    });

    it('should return audit log when found', async () => {
      const log = { id: 'log-1', sequenceNumber: 1 };
      auditRepoMock.findOne.mockResolvedValue(log);

      const result = await service.getLogById('log-1');
      expect(result).toBe(log);
    });
  });

  describe('getRecentAlerts', () => {
    it('should query HIGH and CRITICAL logs ordered by sequenceNumber DESC', async () => {
      const alerts = [{ id: 'alert-1', severity: AuditSeverity.HIGH }];
      auditRepoMock.find.mockResolvedValue(alerts);

      const result = await service.getRecentAlerts(15);
      expect(result).toBe(alerts);
      expect(auditRepoMock.find).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 15,
          order: { sequenceNumber: 'DESC' },
        }),
      );
    });
  });

  describe('getStats', () => {
    it('should return cached stats if present in Redis', async () => {
      const cached = { totalLogs: 100 };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.getStats();
      expect(result).toBe(cached);
      expect(auditRepoMock.count).not.toHaveBeenCalled();
    });

    it('should compute stats from database and cache result', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      auditRepoMock.count
        .mockResolvedValueOnce(50) // total
        .mockResolvedValueOnce(20) // INFO
        .mockResolvedValueOnce(10) // LOW
        .mockResolvedValueOnce(10) // MEDIUM
        .mockResolvedValueOnce(8)  // HIGH
        .mockResolvedValueOnce(2)  // CRITICAL
        .mockResolvedValueOnce(3)  // failed logins
        .mockResolvedValueOnce(1); // geofence breaches

      const stats = await service.getStats();

      expect(stats.totalLogs).toBe(50);
      expect(stats.severityCounts[AuditSeverity.CRITICAL]).toBe(2);
      expect(stats.failedLoginsLast24h).toBe(3);
      expect(stats.geofenceBreachesLast24h).toBe(1);
      expect(stats.recentHighSeverityCount).toBe(10);
      expect(cacheServiceMock.set).toHaveBeenCalledWith('cr:audit:stats', stats, 60);
    });
  });

  describe('verifyIntegrity', () => {
    it('should return intact report with 0 verified when no logs exist', async () => {
      queryBuilderMock.getMany.mockResolvedValue([]);

      const report = await service.verifyIntegrity();
      expect(report.isIntact).toBe(true);
      expect(report.totalVerified).toBe(0);
      expect(report.unbrokenChainLength).toBe(0);
      expect(report.errors).toHaveLength(0);
    });

    it('should verify completely intact 3-block cryptographic hash chain', async () => {
      const t1 = new Date('2026-11-03T10:00:00.000Z');
      const t2 = new Date('2026-11-03T10:01:00.000Z');
      const t3 = new Date('2026-11-03T10:02:00.000Z');

      const p1 = service.buildCanonicalPayload(1, t1, 'u1', 'STUDENT', 'LOGIN_SUCCESS', 'INFO', 'AUTH', null, '127.0.0.1', {}, genesisHash);
      const h1 = service.computeHash(p1);

      const p2 = service.buildCanonicalPayload(2, t2, 'u1', 'STUDENT', 'ATTENDANCE_MARKED', 'INFO', 'ATTENDANCE', 'i1', '127.0.0.1', {}, h1);
      const h2 = service.computeHash(p2);

      const p3 = service.buildCanonicalPayload(3, t3, 'u1', 'STUDENT', 'LOGOUT', 'INFO', 'AUTH', null, '127.0.0.1', {}, h2);
      const h3 = service.computeHash(p3);

      const chain = [
        { sequenceNumber: 1, timestamp: t1, actorId: 'u1', actorRole: 'STUDENT', action: 'LOGIN_SUCCESS', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: genesisHash, currentHash: h1 },
        { sequenceNumber: 2, timestamp: t2, actorId: 'u1', actorRole: 'STUDENT', action: 'ATTENDANCE_MARKED', severity: 'INFO', resource: 'ATTENDANCE', resourceId: 'i1', ipAddress: '127.0.0.1', details: {}, previousHash: h1, currentHash: h2 },
        { sequenceNumber: 3, timestamp: t3, actorId: 'u1', actorRole: 'STUDENT', action: 'LOGOUT', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: h2, currentHash: h3 },
      ];

      queryBuilderMock.getMany.mockResolvedValue(chain);

      const report = await service.verifyIntegrity();
      expect(report.isIntact).toBe(true);
      expect(report.totalVerified).toBe(3);
      expect(report.unbrokenChainLength).toBe(3);
      expect(report.genesisHashValid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });

    it('should detect sequence gaps when a record is deleted', async () => {
      const t1 = new Date('2026-11-03T10:00:00.000Z');
      const t3 = new Date('2026-11-03T10:02:00.000Z');

      const p1 = service.buildCanonicalPayload(1, t1, 'u1', 'STUDENT', 'LOGIN_SUCCESS', 'INFO', 'AUTH', null, '127.0.0.1', {}, genesisHash);
      const h1 = service.computeHash(p1);

      // Block 2 was deleted, so block 3 has sequenceNumber 3
      const chain = [
        { sequenceNumber: 1, timestamp: t1, actorId: 'u1', actorRole: 'STUDENT', action: 'LOGIN_SUCCESS', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: genesisHash, currentHash: h1 },
        { sequenceNumber: 3, timestamp: t3, actorId: 'u1', actorRole: 'STUDENT', action: 'LOGOUT', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: 'some_hash', currentHash: 'hash_3' },
      ];

      queryBuilderMock.getMany.mockResolvedValue(chain);

      const report = await service.verifyIntegrity();
      expect(report.isIntact).toBe(false);
      expect(report.errors.some((e) => e.includes('Sequence Gap Detected'))).toBe(true);
    });

    it('should detect hash chain break when previousHash is invalid', async () => {
      const t1 = new Date('2026-11-03T10:00:00.000Z');
      const t2 = new Date('2026-11-03T10:01:00.000Z');

      const p1 = service.buildCanonicalPayload(1, t1, 'u1', 'STUDENT', 'LOGIN_SUCCESS', 'INFO', 'AUTH', null, '127.0.0.1', {}, genesisHash);
      const h1 = service.computeHash(p1);

      const chain = [
        { sequenceNumber: 1, timestamp: t1, actorId: 'u1', actorRole: 'STUDENT', action: 'LOGIN_SUCCESS', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: genesisHash, currentHash: h1 },
        { sequenceNumber: 2, timestamp: t2, actorId: 'u1', actorRole: 'STUDENT', action: 'LOGIN_SUCCESS', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: 'corrupted_hash', currentHash: 'h2' },
      ];

      queryBuilderMock.getMany.mockResolvedValue(chain);

      const report = await service.verifyIntegrity();
      expect(report.isIntact).toBe(false);
      expect(report.errors.some((e) => e.includes('Hash Chain Break'))).toBe(true);
    });

    it('should detect tampered record when data fields are modified', async () => {
      const t1 = new Date('2026-11-03T10:00:00.000Z');

      const chain = [
        { sequenceNumber: 1, timestamp: t1, actorId: 'tampered-actor', actorRole: 'ADMIN', action: 'LOGIN_SUCCESS', severity: 'INFO', resource: 'AUTH', resourceId: null, ipAddress: '127.0.0.1', details: {}, previousHash: genesisHash, currentHash: 'forged_hash_value' },
      ];

      queryBuilderMock.getMany.mockResolvedValue(chain);

      const report = await service.verifyIntegrity();
      expect(report.isIntact).toBe(false);
      expect(report.errors.some((e) => e.includes('Tampered Record Detected'))).toBe(true);
    });

    it('should support verification with fromSeq and toSeq options', async () => {
      queryBuilderMock.getMany.mockResolvedValue([]);

      await service.verifyIntegrity({ fromSeq: 10, toSeq: 20 });
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'audit.sequenceNumber >= :fromSeq',
        { fromSeq: 10 },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'audit.sequenceNumber <= :toSeq',
        { toSeq: 20 },
      );
    });
  });
});

