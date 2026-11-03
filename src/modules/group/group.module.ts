import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { GroupMember } from './entities/group-member.entity';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student } from '../student/entities/student.entity';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Group,
      GroupMember,
      Course,
      CourseStudent,
      Student,
    ]),
    RedisModule,
    QueueModule,
  ],
  controllers: [GroupController],
  providers: [GroupService],
  exports: [GroupService],
})
export class GroupModule {}

