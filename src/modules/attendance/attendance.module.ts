import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AttendanceInstance } from './entities/attendance-instance.entity';
import { Attendance } from './entities/attendance.entity';
import { AttendanceLog } from './entities/attendance-log.entity';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student } from '../student/entities/student.entity';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceGateway } from './attendance.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AttendanceInstance,
      Attendance,
      AttendanceLog,
      Course,
      CourseStudent,
      Student,
    ]),
    JwtModule.register({}),
    RedisModule,
    QueueModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceGateway],
  exports: [AttendanceService, AttendanceGateway],
})
export class AttendanceModule {}

