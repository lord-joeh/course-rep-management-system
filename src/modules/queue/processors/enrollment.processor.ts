import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QueueName, EnrollmentJobType } from '../constants';
import {
  EnrollmentJobData,
  EnrollStudentAllCoursesJobData,
  EnrollAllStudentsCourseJobData,
} from '../dto';
import { Course } from '../../course/entities/course.entity';
import { CourseStudent } from '../../course/entities/course-student.entity';
import { Student, StudentStatus } from '../../student/entities/student.entity';
import { CacheService } from '../../redis/cache.service';

@Processor(QueueName.ENROLLMENT)
export class EnrollmentProcessor extends WorkerHost {
  private readonly logger = new Logger(EnrollmentProcessor.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(CourseStudent)
    private readonly courseStudentRepository: Repository<CourseStudent>,
    private readonly cacheService: CacheService,
  ) {
    super();
  }

  async process(job: Job<EnrollmentJobData, any, string>): Promise<any> {
    const data = job.data;
    this.logger.log(`Processing enrollment job [${job.id}] type [${data.type}]`);

    switch (data.type) {
      case EnrollmentJobType.ENROLL_STUDENT_ALL_COURSES:
        return this.handleEnrollStudentAllCourses(
          job.id,
          data as EnrollStudentAllCoursesJobData,
        );

      case EnrollmentJobType.ENROLL_ALL_STUDENTS_COURSE:
        return this.handleEnrollAllStudentsCourse(
          job.id,
          data as EnrollAllStudentsCourseJobData,
        );

      default:
        throw new Error(`Unsupported enrollment job type: ${(data as any).type}`);
    }
  }

  private async handleEnrollStudentAllCourses(
    jobId: string | undefined,
    data: EnrollStudentAllCoursesJobData,
  ): Promise<{ success: boolean; enrolledCount: number }> {
    const { studentId } = data;
    this.logger.log(
      `Job [${jobId}]: Auto-enrolling student [${studentId}] into all courses`,
    );

    const courses = await this.courseRepository.find({ select: ['id'] });
    if (!courses.length) {
      this.logger.warn(`No courses found to enroll student [${studentId}]`);
      return { success: true, enrolledCount: 0 };
    }

    const now = new Date();
    const records = courses.map((course) => ({
      courseId: course.id,
      studentId,
      isRegister: true,
      createdAt: now,
      updatedAt: now,
    }));

    await this.courseStudentRepository
      .createQueryBuilder()
      .insert()
      .into(CourseStudent)
      .values(records)
      .orIgnore()
      .execute();

    await this.cacheService.scanAndInvalidate(`cr:student-courses:${studentId}:*`);
    await this.cacheService.scanAndInvalidate('cr:student-courses:*');
    await this.cacheService.scanAndInvalidate('cr:courses:*');

    this.logger.log(
      `Job [${jobId}]: Successfully processed auto-enrollment for student [${studentId}] across ${records.length} courses`,
    );

    return { success: true, enrolledCount: records.length };
  }

  private async handleEnrollAllStudentsCourse(
    jobId: string | undefined,
    data: EnrollAllStudentsCourseJobData,
  ): Promise<{ success: boolean; enrolledCount: number }> {
    const { courseId } = data;
    this.logger.log(
      `Job [${jobId}]: Auto-enrolling all active students into course [${courseId}]`,
    );

    const students = await this.studentRepository.find({
      where: { status: StudentStatus.ACTIVE },
      select: ['id'],
    });

    if (!students.length) {
      this.logger.warn(
        `No active students found to enroll into course [${courseId}]`,
      );
      return { success: true, enrolledCount: 0 };
    }

    const now = new Date();
    const records = students.map((student) => ({
      courseId,
      studentId: student.id,
      isRegister: true,
      createdAt: now,
      updatedAt: now,
    }));

    await this.courseStudentRepository
      .createQueryBuilder()
      .insert()
      .into(CourseStudent)
      .values(records)
      .orIgnore()
      .execute();

    await this.cacheService.scanAndInvalidate('cr:student-courses:*');
    await this.cacheService.scanAndInvalidate('cr:courses:*');

    this.logger.log(
      `Job [${jobId}]: Successfully enrolled ${records.length} students into course [${courseId}]`,
    );

    return { success: true, enrolledCount: records.length };
  }
}

