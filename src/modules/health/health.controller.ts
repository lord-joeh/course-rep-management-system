import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CacheService } from '../redis/cache.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
  ) {}

  @Public()
  @Get()
  async check() {
    let dbStatus = 'disconnected';
    let dbError: string | null = null;
    let redisStatus = 'disconnected';
    let redisError: string | null = null;

    // Check Database connectivity
    try {
      if (this.dataSource.isInitialized) {
        await this.dataSource.query('SELECT 1');
        dbStatus = 'connected';
      }
    } catch (err: any) {
      dbStatus = 'error';
      dbError = err.message;
    }

    // Check Redis connectivity
    try {
      const pingRes = await this.cacheService.ping();
      if (pingRes === 'PONG') {
        redisStatus = 'connected';
      }
    } catch (err: any) {
      redisStatus = 'error';
      redisError = err.message;
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

    return {
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbStatus,
          error: dbError,
        },
        redis: {
          status: redisStatus,
          error: redisError,
        },
      },
    };
  }
}
