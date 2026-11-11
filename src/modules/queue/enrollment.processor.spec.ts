import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { EnrollmentProcessor } from './processors/enrollment.processor';
import { Course } from '../course/entities/course.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { Student, StudentStatus } from '../student/entities/student.entity';
import { CacheService } from '../redis/cache.service';
import { EnrollmentJobType } from './constants';
import { EnrollmentJobData } from './dto';

describe('EnrollmentProcessor', () => {
  let processor: EnrollmentProcessor;
  let mockCourseRepo: any;
  let mockStudentRepo: any;
  let mockCourseStudentRepo: any;
  let mockCacheService: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest
        .fn()
        .mockResolvedValue({ identifiers: [], generatedMaps: [], raw: [] }),
    };

    mockCourseRepo = {
      find: jest.fn(),
    };

    mockStudentRepo = {
      find: jest.fn(),
    };

    mockCourseStudentRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    mockCacheService = {
      scanAndInvalidate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentProcessor,
        {
          provide: getRepositoryToken(Course),
          useValue: mockCourseRepo,
        },
        {
          provide: getRepositoryToken(Student),
          useValue: mockStudentRepo,
        },
        {
          provide: getRepositoryToken(CourseStudent),
          useValue: mockCourseStudentRepo,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    processor = module.get<EnrollmentProcessor>(EnrollmentProcessor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('ENROLL_STUDENT_ALL_COURSES', () => {
    it('should bulk enroll student into all available courses and invalidate caches', async () => {
      mockCourseRepo.find.mockResolvedValue([
        { id: 'CPEN401' },
        { id: 'CPEN402' },
        { id: 'SENG401' },
      ]);

      const job = {
        id: 'job-enroll-1',
        data: {
          type: EnrollmentJobType.ENROLL_STUDENT_ALL_COURSES,
          studentId: 'STD-100',
        },
      } as Job<EnrollmentJobData, any, string>;

      const result = await processor.process(job);

      expect(mockCourseRepo.find).toHaveBeenCalledWith({ select: ['id'] });
      expect(mockCourseStudentRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.into).toHaveBeenCalledWith(CourseStudent);
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ courseId: 'CPEN401', studentId: 'STD-100' }),
          expect.objectContaining({ courseId: 'CPEN402', studentId: 'STD-100' }),
          expect.objectContaining({ courseId: 'SENG401', studentId: 'STD-100' }),
        ]),
      );
      expect(mockQueryBuilder.orIgnore).toHaveBeenCalled();
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(mockCacheService.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:student-courses:STD-100:*',
      );
      expect(mockCacheService.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:student-courses:*',
      );
      expect(mockCacheService.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:courses:*',
      );
      expect(result).toEqual({ success: true, enrolledCount: 3 });
    });

    it('should return 0 count when no courses exist in database', async () => {
      mockCourseRepo.find.mockResolvedValue([]);

      const job = {
        id: 'job-enroll-empty',
        data: {
          type: EnrollmentJobType.ENROLL_STUDENT_ALL_COURSES,
          studentId: 'STD-100',
        },
      } as Job<EnrollmentJobData, any, string>;

      const result = await processor.process(job);

      expect(mockCourseStudentRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, enrolledCount: 0 });
    });
  });

  describe('ENROLL_ALL_STUDENTS_COURSE', () => {
    it('should bulk enroll all active students into new course and invalidate caches', async () => {
      mockStudentRepo.find.mockResolvedValue([
        { id: 'STD-1' },
        { id: 'STD-2' },
      ]);

      const job = {
        id: 'job-course-1',
        data: {
          type: EnrollmentJobType.ENROLL_ALL_STUDENTS_COURSE,
          courseId: 'MATH101',
        },
      } as Job<EnrollmentJobData, any, string>;

      const result = await processor.process(job);

      expect(mockStudentRepo.find).toHaveBeenCalledWith({
        where: { status: StudentStatus.ACTIVE },
        select: ['id'],
      });
      expect(mockCourseStudentRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ courseId: 'MATH101', studentId: 'STD-1' }),
          expect.objectContaining({ courseId: 'MATH101', studentId: 'STD-2' }),
        ]),
      );
      expect(mockQueryBuilder.orIgnore).toHaveBeenCalled();
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
      expect(mockCacheService.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:student-courses:*',
      );
      expect(mockCacheService.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:courses:*',
      );
      expect(result).toEqual({ success: true, enrolledCount: 2 });
    });

    it('should return 0 count when no active students exist', async () => {
      mockStudentRepo.find.mockResolvedValue([]);

      const job = {
        id: 'job-course-empty',
        data: {
          type: EnrollmentJobType.ENROLL_ALL_STUDENTS_COURSE,
          courseId: 'MATH101',
        },
      } as Job<EnrollmentJobData, any, string>;

      const result = await processor.process(job);

      expect(mockCourseStudentRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, enrolledCount: 0 });
    });
  });

  it('should throw error for unsupported job type', async () => {
    const job = {
      id: 'job-unsupported',
      data: {
        type: 'UNSUPPORTED_JOB' as any,
      },
    } as Job<EnrollmentJobData, any, string>;

    await expect(processor.process(job)).rejects.toThrow(
      'Unsupported enrollment job type: UNSUPPORTED_JOB',
    );
  });
});

