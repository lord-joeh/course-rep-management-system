import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /**
   * Retrieves a cached value and parses it from JSON.
   * Returns null if key does not exist or upon failure.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as T;
    } catch (error) {
      this.logger.error(`Error reading cache key "${key}": ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Serializes value to JSON and stores it with an optional TTL (in seconds).
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.redis.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(`Error setting cache key "${key}": ${(error as Error).message}`);
    }
  }

  /**
   * Deletes a single key.
   */
  async del(key: string): Promise<boolean> {
    try {
      const result = await this.redis.unlink(key);
      return result > 0;
    } catch (error) {
      this.logger.error(`Error deleting cache key "${key}": ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Deletes multiple keys in a single non-blocking UNLINK operation.
   */
  async delMany(keys: string[]): Promise<number> {
    if (!keys || keys.length === 0) {
      return 0;
    }
    try {
      return await this.redis.unlink(...keys);
    } catch (error) {
      this.logger.error(`Error deleting multiple cache keys: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Non-blocking pattern invalidation using Redis SCAN cursor and UNLINK.
   * Unlike KEYS *, SCAN iterates incrementally without blocking the Redis single thread.
   */
  async scanAndInvalidate(pattern: string): Promise<number> {
    let cursor = '0';
    let totalInvalidated = 0;

    try {
      do {
        // Scan with count batch of 100
        const [nextCursor, matchedKeys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (matchedKeys.length > 0) {
          const removed = await this.redis.unlink(...matchedKeys);
          totalInvalidated += removed;
        }
      } while (cursor !== '0');

      if (totalInvalidated > 0) {
        this.logger.debug(`Invalidated ${totalInvalidated} keys matching pattern: "${pattern}"`);
      }
      return totalInvalidated;
    } catch (error) {
      this.logger.error(`Error invalidating pattern "${pattern}": ${(error as Error).message}`);
      return totalInvalidated;
    }
  }

  /**
   * Checks if a key exists in cache.
   */
  async has(key: string): Promise<boolean> {
    try {
      const exists = await this.redis.exists(key);
      return exists === 1;
    } catch (error) {
      this.logger.error(`Error checking cache key "${key}": ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Returns remaining TTL of a key in seconds (-1: no TTL, -2: key does not exist).
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key "${key}": ${(error as Error).message}`);
      return -2;
    }
  }

  /**
   * Pings the Redis instance to verify active connection.
   */
  async ping(): Promise<string> {
    return this.redis.ping();
  }
}

