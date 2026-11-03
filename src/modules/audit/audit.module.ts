import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityAuditLog } from './entities/security-audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SecurityAuditLog]),
    RedisModule,
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}

