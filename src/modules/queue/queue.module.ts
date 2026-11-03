import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

import { QueueName } from './constants';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { BullBoardAuthGuard } from './guards/bull-board-auth.guard';

import { EmailProcessor } from './processors/email.processor';
import { SmsProcessor } from './processors/sms.processor';
import { DriveSyncProcessor } from './processors/drive-sync.processor';
import { AttendanceProcessor } from './processors/attendance.processor';

import { Slide } from '../slide/entities/slide.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student } from '../student/entities/student.entity';
import { Assignment } from '../assignment/entities/assignment.entity';
import { AssignmentSubmission } from '../assignment/entities/assignment-submission.entity';
import { GoogleModule } from '../google/google.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Slide,
      Attendance,
      CourseStudent,
      Student,
      Assignment,
      AssignmentSubmission,
    ]),
    GoogleModule,

    // BullMQ Connection Configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: Number(configService.get<number>('REDIS_PORT', 6379)),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    // Register 4 Isolated Queues
    BullModule.registerQueue(
      { name: QueueName.EMAIL },
      { name: QueueName.SMS },
      { name: QueueName.DRIVE_SYNC },
      { name: QueueName.ATTENDANCE },
    ),

    // Bull Board Queue Dashboard UI at /admin/queues/ui
    BullBoardModule.forRoot({
      route: '/admin/queues/ui',
      adapter: ExpressAdapter,
    }),
    BullBoardModule.forFeature(
      { name: QueueName.EMAIL, adapter: BullMQAdapter },
      { name: QueueName.SMS, adapter: BullMQAdapter },
      { name: QueueName.DRIVE_SYNC, adapter: BullMQAdapter },
      { name: QueueName.ATTENDANCE, adapter: BullMQAdapter },
    ),
  ],
  controllers: [QueueController],
  providers: [
    QueueService,
    BullBoardAuthGuard,
    EmailProcessor,
    SmsProcessor,
    DriveSyncProcessor,
    AttendanceProcessor,
  ],
  exports: [QueueService, BullModule],
})
export class QueueModule {}

