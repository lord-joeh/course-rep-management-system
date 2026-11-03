import { Test, TestingModule } from '@nestjs/testing';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AuditAction, AuditSeverity } from './entities/security-audit-log.entity';

describe('AuditController', () => {
  let controller: AuditController;
  let auditServiceMock: any;

  beforeEach(async () => {
    auditServiceMock = {
      getLogs: jest.fn().mockResolvedValue({
        items: [{ id: 'log-1', sequenceNumber: 1 }],
        meta: { total: 1, page: 1, limit: 20 },
      }),
      getStats: jest.fn().mockResolvedValue({
        totalLogs: 10,
        severityCounts: {},
        failedLoginsLast24h: 1,
        geofenceBreachesLast24h: 0,
        recentHighSeverityCount: 1,
      }),
      getRecentAlerts: jest.fn().mockResolvedValue([
        { id: 'alert-1', severity: AuditSeverity.HIGH },
      ]),
      verifyIntegrity: jest.fn().mockResolvedValue({
        isIntact: true,
        totalVerified: 10,
        unbrokenChainLength: 10,
        genesisHashValid: true,
        verifiedAt: new Date(),
        errors: [],
      }),
      getLogById: jest.fn().mockResolvedValue({
        id: 'log-1',
        sequenceNumber: 1,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [
        {
          provide: AuditService,
          useValue: auditServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AuditController>(AuditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLogs', () => {
    it('should delegate to auditService.getLogs with query params', async () => {
      const query = { page: 1, limit: 10, action: AuditAction.LOGIN_SUCCESS };
      const result = await controller.getLogs(query);

      expect(auditServiceMock.getLogs).toHaveBeenCalledWith(query);
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should delegate to auditService.getStats', async () => {
      const result = await controller.getStats();

      expect(auditServiceMock.getStats).toHaveBeenCalled();
      expect(result.totalLogs).toBe(10);
    });
  });

  describe('getRecentAlerts', () => {
    it('should delegate to auditService.getRecentAlerts with limit', async () => {
      const result = await controller.getRecentAlerts(10);

      expect(auditServiceMock.getRecentAlerts).toHaveBeenCalledWith(10);
      expect(result).toHaveLength(1);
    });

    it('should default limit to 20 when limit is omitted', async () => {
      await controller.getRecentAlerts(undefined);
      expect(auditServiceMock.getRecentAlerts).toHaveBeenCalledWith(20);
    });
  });

  describe('verifyIntegrity', () => {
    it('should delegate to auditService.verifyIntegrity with optional sequence bounds', async () => {
      const result = await controller.verifyIntegrity(5, 15);

      expect(auditServiceMock.verifyIntegrity).toHaveBeenCalledWith({
        fromSeq: 5,
        toSeq: 15,
      });
      expect(result.isIntact).toBe(true);
    });
  });

  describe('getLogById', () => {
    it('should delegate to auditService.getLogById with id param', async () => {
      const result = await controller.getLogById('uuid-1');

      expect(auditServiceMock.getLogById).toHaveBeenCalledWith('uuid-1');
      expect(result.id).toBe('log-1');
    });
  });
});

