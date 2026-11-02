import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course } from './entities/course.entity';
import { CourseStudent } from './entities/course-student.entity';
import { Lecturer } from '../lecturer/entities/lecturer.entity';
import { Student } from '../student/entities/student.entity';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Course, CourseStudent, Lecturer, Student]),
  ],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService, TypeOrmModule],
})
export class CourseModule {}

