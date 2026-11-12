import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { Student } from '../student/entities/student.entity';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { NotificationService } from './notification.service';
import { NotificationDispatcherService } from './services/notification-dispatcher.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { FirebaseMessagingService } from './firebase-messaging.service';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationRead,
      FcmToken,
      Student,
      Course,
      CourseStudent,
    ]),
    RedisModule,
    QueueModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationDispatcherService,
    NotificationGateway,
    FirebaseMessagingService,
  ],
  exports: [
    NotificationService,
    NotificationDispatcherService,
    NotificationGateway,
    FirebaseMessagingService,
  ],
})
export class NotificationModule {}
