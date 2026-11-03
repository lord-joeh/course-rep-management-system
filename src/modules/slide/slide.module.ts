import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Slide } from './entities/slide.entity';
import { Course } from '../course/entities/course.entity';
import { SlideService } from './slide.service';
import { SlideController } from './slide.controller';
import { GoogleModule } from '../google/google.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Slide, Course]),
    GoogleModule,
    RedisModule,
    QueueModule,
  ],
  controllers: [SlideController],
  providers: [SlideService],
  exports: [SlideService, TypeOrmModule],
})
export class SlideModule {}

