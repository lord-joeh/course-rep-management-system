import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';
import { CacheService } from '../redis/cache.service';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSourceMock: {
    isInitialized: boolean;
    query: jest.Mock;
  };
  let cacheServiceMock: {
    ping: jest.Mock;
  };

  beforeEach(async () => {
    dataSourceMock = {
      isInitialized: true,
      query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    cacheServiceMock = {
      ping: jest.fn().mockResolvedValue('PONG'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should report "ok" when both Database and Redis are healthy', async () => {
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.services.database.status).toBe('connected');
    expect(result.services.database.error).toBeNull();
    expect(result.services.redis.status).toBe('connected');
    expect(result.services.redis.error).toBeNull();
    expect(result.timestamp).toBeDefined();
  });

  it('should report "degraded" when database is not initialized', async () => {
    dataSourceMock.isInitialized = false;

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.services.database.status).toBe('disconnected');
    expect(result.services.database.error).toBeNull();
    expect(dataSourceMock.query).not.toHaveBeenCalled();
  });

  it('should report "degraded" when database query fails with exception', async () => {
    dataSourceMock.query.mockRejectedValue(new Error('Connection timeout to PostgreSQL'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.services.database.status).toBe('error');
    expect(result.services.database.error).toBe('Connection timeout to PostgreSQL');
  });

  it('should report "degraded" when Redis ping returns non-PONG string', async () => {
    cacheServiceMock.ping.mockResolvedValue('NO_RESPONSE');

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.services.redis.status).toBe('disconnected');
    expect(result.services.redis.error).toBeNull();
  });

  it('should report "degraded" when Redis ping throws an exception', async () => {
    cacheServiceMock.ping.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.services.redis.status).toBe('error');
    expect(result.services.redis.error).toBe('ECONNREFUSED 127.0.0.1:6379');
  });
});

