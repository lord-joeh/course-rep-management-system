import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from './cache.service';
import { REDIS_CLIENT } from './redis.constants';

describe('CacheService', () => {
  let service: CacheService;
  let mockRedis: any;

  beforeEach(async () => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      unlink: jest.fn(),
      scan: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: REDIS_CLIENT,
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return parsed JSON object on cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ name: 'John' }));
      const result = await service.get<{ name: string }>('test-key');
      expect(result).toEqual({ name: 'John' });
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('non-existent');
      expect(result).toBeNull();
    });

    it('should catch JSON parse errors and return null', async () => {
      mockRedis.get.mockResolvedValue('invalid-json{');
      const result = await service.get('corrupted-key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set key with TTL when ttlSeconds > 0', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.set('test-key', { id: 1 }, 300);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({ id: 1 }),
        'EX',
        300,
      );
    });

    it('should set key without TTL when ttlSeconds is not provided or <= 0', async () => {
      mockRedis.set.mockResolvedValue('OK');
      await service.set('test-key', { id: 1 });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify({ id: 1 }),
      );
    });

    it('should catch error when redis.set fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis connection lost'));
      await expect(service.set('test-key', { id: 1 })).resolves.not.toThrow();
    });
  });

  describe('del', () => {
    it('should return true when key is successfully deleted', async () => {
      mockRedis.unlink.mockResolvedValue(1);
      const result = await service.del('test-key');
      expect(result).toBe(true);
      expect(mockRedis.unlink).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key did not exist', async () => {
      mockRedis.unlink.mockResolvedValue(0);
      const result = await service.del('missing-key');
      expect(result).toBe(false);
    });

    it('should return false when redis.unlink throws error', async () => {
      mockRedis.unlink.mockRejectedValue(new Error('Failed to unlink'));
      const result = await service.del('error-key');
      expect(result).toBe(false);
    });
  });

  describe('delMany', () => {
    it('should return 0 when keys array is empty or null', async () => {
      expect(await service.delMany([])).toBe(0);
      expect(await service.delMany(null as any)).toBe(0);
      expect(mockRedis.unlink).not.toHaveBeenCalled();
    });

    it('should call redis.unlink with spread keys and return count', async () => {
      mockRedis.unlink.mockResolvedValue(3);
      const result = await service.delMany(['k1', 'k2', 'k3']);
      expect(result).toBe(3);
      expect(mockRedis.unlink).toHaveBeenCalledWith('k1', 'k2', 'k3');
    });

    it('should catch error and return 0 if redis.unlink fails', async () => {
      mockRedis.unlink.mockRejectedValue(new Error('Unlink failed'));
      const result = await service.delMany(['k1']);
      expect(result).toBe(0);
    });
  });

  describe('scanAndInvalidate', () => {
    it('should iteratively scan with cursor and unlink matching keys', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['42', ['k1', 'k2']])
        .mockResolvedValueOnce(['0', ['k3']]);
      mockRedis.unlink
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1);

      const total = await service.scanAndInvalidate('cr:students:*');
      expect(total).toBe(3);
      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.unlink).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when scan finds no matching keys', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      const total = await service.scanAndInvalidate('cr:empty:*');
      expect(total).toBe(0);
      expect(mockRedis.unlink).not.toHaveBeenCalled();
    });

    it('should catch errors gracefully during scan and return accumulated count', async () => {
      mockRedis.scan.mockRejectedValue(new Error('Scan failed'));
      const total = await service.scanAndInvalidate('cr:error:*');
      expect(total).toBe(0);
    });
  });

  describe('has', () => {
    it('should return true when key exists (exists returns 1)', async () => {
      mockRedis.exists.mockResolvedValue(1);
      expect(await service.has('test-key')).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist (exists returns 0)', async () => {
      mockRedis.exists.mockResolvedValue(0);
      expect(await service.has('test-key')).toBe(false);
    });

    it('should return false when exists throws an error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Exists failed'));
      expect(await service.has('test-key')).toBe(false);
    });
  });

  describe('ttl', () => {
    it('should return TTL number from redis', async () => {
      mockRedis.ttl.mockResolvedValue(300);
      expect(await service.ttl('test-key')).toBe(300);
      expect(mockRedis.ttl).toHaveBeenCalledWith('test-key');
    });

    it('should return -2 when ttl check throws error', async () => {
      mockRedis.ttl.mockRejectedValue(new Error('TTL failed'));
      expect(await service.ttl('test-key')).toBe(-2);
    });
  });

  describe('ping', () => {
    it('should return PONG from redis.ping()', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      expect(await service.ping()).toBe('PONG');
      expect(mockRedis.ping).toHaveBeenCalled();
    });
  });
});

