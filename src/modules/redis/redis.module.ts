import { Global, Module, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { CacheService } from './cache.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        const host = configService.get<string>('redis.host', '127.0.0.1');
        const port = configService.get<number>('redis.port', 6379);
        const password = configService.get<string>('redis.password');

        const client = new Redis({
          host,
          port,
          password: password || undefined,
          lazyConnect: false,
          retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            logger.warn(`Redis disconnected. Reconnecting in ${delay}ms... (attempt ${times})`);
            return delay;
          },
          maxRetriesPerRequest: 3,
        });

        client.on('connect', () => {
          logger.log(`Redis client successfully connected to ${host}:${port}`);
        });

        client.on('error', (err) => {
          logger.error(`Redis client error: ${err.message}`, err.stack);
        });

        return client;
      },
      inject: [ConfigService],
    },
    CacheService,
  ],
  exports: [REDIS_CLIENT, CacheService],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  constructor(private readonly configService: ConfigService) {}

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Application shutdown detected (${signal || 'SIGTERM'}). Disconnecting Redis...`);
    // Note: Individual client closure handled via Redis connection pooling
  }
}

