import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { Student } from '../student/entities/student.entity';
import { Course } from '../course/entities/course.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { FirebaseMessagingService } from './firebase-messaging.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationRead,
      FcmToken,
      Student,
      Course,
    ]),
    RedisModule,
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
    FirebaseMessagingService,
  ],
  exports: [NotificationService, NotificationGateway, FirebaseMessagingService],
})
export class NotificationModule {}
