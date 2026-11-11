import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';

import { Course } from './entities/course.entity';
import { CourseStudent } from './entities/course-student.entity';
import { Lecturer } from '../lecturer/entities/lecturer.entity';
import { Student } from '../student/entities/student.entity';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { CACHE_TTL } from '../../common/constants/cache.constants';
import { CreateCourseDto, UpdateCourseDto, CourseQueryDto } from './dto';
import { PaginatedResult } from '../../common/pagination';

@Injectable()
export class CourseService {
  private readonly logger = new Logger(CourseService.name);

  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseStudent)
    private readonly courseStudentRepository: Repository<CourseStudent>,
    @InjectRepository(Lecturer)
    private readonly lecturerRepository: Repository<Lecturer>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Create and persist a new academic course.
   */
  async create(dto: CreateCourseDto): Promise<Course> {
    const courseId = dto.id.trim().toUpperCase();

    const existingCourse = await this.courseRepository.findOne({
      where: { id: courseId },
    });
    if (existingCourse) {
      throw new ConflictException(
        `Course with code "${courseId}" already exists`,
      );
    }

    if (dto.lecturerId) {
      const lecturer = await this.lecturerRepository.findOne({
        where: { id: dto.lecturerId },
      });
      if (!lecturer) {
        throw new NotFoundException(
          `Lecturer with ID "${dto.lecturerId}" not found`,
        );
      }
    }

    const now = new Date();
    const course = this.courseRepository.create({
      id: courseId,
      name: dto.name,
      lecturerId: dto.lecturerId || null,
      day: dto.day,
      startTime: dto.startTime,
      endTime: dto.endTime,
      semester: dto.semester,
      slidesFolderId: dto.slidesFolderId || null,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.courseRepository.save(course);

    // Enqueue auto-enrollment of all active students into this course
    await this.queueService.enrollAllStudentsInCourse(saved.id);

    // Invalidate course list cache
    await this.cacheService.scanAndInvalidate('cr:courses:*');

    return this.findById(saved.id);
  }

  /**
   * Retrieve paginated courses with optional search and filters.
   */
  async findPaginated(query: CourseQueryDto): Promise<PaginatedResult<Course>> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const search = query.search?.trim() || '';
    const semester = query.semester?.trim() || '';
    const day = query.day?.trim() || '';
    const lecturerId = query.lecturerId || '';

    const cacheKey = `cr:courses:p=${page}:l=${limit}:s=${encodeURIComponent(search)}:sem=${semester}:d=${day}:lec=${lecturerId}`;

    // 1. Check Redis cache
    const cached = await this.cacheService.get<PaginatedResult<Course>>(cacheKey);
    if (cached) {
      return cached;
    }

    // 2. Query Database
    const qb = this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.lecturer', 'lecturer');

    if (search) {
      qb.andWhere(
        '(LOWER(course.id) LIKE LOWER(:search) OR LOWER(course.name) LIKE LOWER(:search))',
        { search: `%${search}%` },
      );
    }

    if (semester) {
      qb.andWhere('LOWER(course.semester) = LOWER(:semester)', { semester });
    }

    if (day) {
      qb.andWhere('LOWER(course.day) = LOWER(:day)', { day });
    }

    if (lecturerId) {
      qb.andWhere('course.lecturerId = :lecturerId', { lecturerId });
    }

    qb.orderBy('course.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    const result: PaginatedResult<Course> = {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    // 3. Cache in Redis for 15 minutes
    await this.cacheService.set(cacheKey, result, CACHE_TTL.FIFTEEN_MINUTES);

    return result;
  }

  /**
   * Find course by ID with lecturer relation.
   */
  async findById(id: string): Promise<Course> {
    const courseId = id.trim().toUpperCase();
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['lecturer'],
    });

    if (!course) {
      throw new NotFoundException(`Course with code "${courseId}" not found`);
    }

    return course;
  }

  /**
   * Update an existing course record.
   */
  async update(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.findById(id);

    if (dto.lecturerId) {
      const lecturer = await this.lecturerRepository.findOne({
        where: { id: dto.lecturerId },
      });
      if (!lecturer) {
        throw new NotFoundException(
          `Lecturer with ID "${dto.lecturerId}" not found`,
        );
      }
    }

    await this.courseRepository.update(course.id, {
      ...dto,
      updatedAt: new Date(),
    });

    // Invalidate course caches
    await this.cacheService.scanAndInvalidate('cr:courses:*');
    await this.cacheService.scanAndInvalidate('cr:student-courses:*');

    return this.findById(course.id);
  }

  /**
   * Delete a course record.
   */
  async delete(id: string): Promise<{ message: string }> {
    const course = await this.findById(id);

    await this.courseRepository.delete(course.id);

    // Invalidate course and enrollment caches
    await this.cacheService.scanAndInvalidate('cr:courses:*');
    await this.cacheService.scanAndInvalidate('cr:student-courses:*');

    return { message: `Course "${course.id}" successfully deleted` };
  }

  /**
   * Enroll the authenticated student in a course with transaction safety.
   */
  async enrollStudent(
    courseId: string,
    studentId: string,
  ): Promise<{ message: string; courseId: string }> {
    const normalizedCourseId = courseId.trim().toUpperCase();

    await this.dataSource.transaction(async (manager) => {
      const course = await manager.findOne(Course, {
        where: { id: normalizedCourseId },
      });
      if (!course) {
        throw new NotFoundException(
          `Course with code "${normalizedCourseId}" not found`,
        );
      }

      const existingEnrollment = await manager.findOne(CourseStudent, {
        where: { courseId: normalizedCourseId, studentId },
      });

      if (existingEnrollment && existingEnrollment.isRegister === true) {
        throw new ConflictException(
          `Already enrolled in course "${normalizedCourseId}"`,
        );
      }

      const now = new Date();
      if (existingEnrollment) {
        existingEnrollment.isRegister = true;
        existingEnrollment.updatedAt = now;
        await manager.save(CourseStudent, existingEnrollment);
      } else {
        const newEnrollment = manager.create(CourseStudent, {
          courseId: normalizedCourseId,
          studentId,
          isRegister: true,
          createdAt: now,
          updatedAt: now,
        });
        await manager.save(CourseStudent, newEnrollment);
      }
    });

    // Invalidate student course cache
    await this.cacheService.scanAndInvalidate(`cr:student-courses:${studentId}:*`);

    return {
      message: `Successfully enrolled in course "${normalizedCourseId}"`,
      courseId: normalizedCourseId,
    };
  }

  /**
   * Unenroll the authenticated student from a course.
   */
  async unenrollStudent(
    courseId: string,
    studentId: string,
  ): Promise<{ message: string; courseId: string }> {
    const normalizedCourseId = courseId.trim().toUpperCase();

    await this.dataSource.transaction(async (manager) => {
      const enrollment = await manager.findOne(CourseStudent, {
        where: { courseId: normalizedCourseId, studentId },
      });

      if (!enrollment || enrollment.isRegister === false) {
        throw new NotFoundException(
          `You are not currently enrolled in course "${normalizedCourseId}"`,
        );
      }

      enrollment.isRegister = false;
      enrollment.updatedAt = new Date();
      await manager.save(CourseStudent, enrollment);
    });

    // Invalidate student course cache
    await this.cacheService.scanAndInvalidate(`cr:student-courses:${studentId}:*`);

    return {
      message: `Successfully unenrolled from course "${normalizedCourseId}"`,
      courseId: normalizedCourseId,
    };
  }

  /**
   * Retrieve active enrolled courses for a student.
   */
  async getStudentCourses(studentId: string): Promise<Course[]> {
    const cacheKey = `cr:student-courses:${studentId}:enrolled`;
    const cached = await this.cacheService.get<Course[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const enrollments = await this.courseStudentRepository.find({
      where: { studentId, isRegister: true },
      relations: ['course', 'course.lecturer'],
    });

    const courses = enrollments
      .map((e) => e.course)
      .filter((course): course is Course => Boolean(course));

    await this.cacheService.set(cacheKey, courses, CACHE_TTL.FIFTEEN_MINUTES);

    return courses;
  }

  /**
   * Retrieve course roster (enrolled students) for a course.
   */
  async getCourseRoster(courseId: string): Promise<Student[]> {
    const normalizedCourseId = courseId.trim().toUpperCase();
    await this.findById(normalizedCourseId);

    const enrollments = await this.courseStudentRepository.find({
      where: { courseId: normalizedCourseId, isRegister: true },
      relations: ['student'],
    });

    return enrollments
      .map((e) => e.student)
      .filter((student): student is Student => Boolean(student));
  }
}

