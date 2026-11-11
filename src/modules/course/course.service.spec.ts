import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { CourseService } from './course.service';
import { Course } from './entities/course.entity';
import { CourseStudent } from './entities/course-student.entity';
import { Lecturer } from '../lecturer/entities/lecturer.entity';
import { Student } from '../student/entities/student.entity';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { CreateCourseDto, UpdateCourseDto, CourseQueryDto } from './dto';

describe('CourseService', () => {
  let service: CourseService;
  let courseRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let courseStudentRepoMock: {
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let lecturerRepoMock: {
    findOne: jest.Mock;
  };
  let studentRepoMock: {
    findOne: jest.Mock;
  };
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    scanAndInvalidate: jest.Mock;
  };
  let dataSourceMock: {
    transaction: jest.Mock;
  };
  let queueServiceMock: {
    enrollAllStudentsInCourse: jest.Mock;
  };

  let queryBuilderMock: any;

  beforeEach(async () => {
    queryBuilderMock = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    queueServiceMock = {
      enrollAllStudentsInCourse: jest.fn().mockResolvedValue('job-course-1'),
    };

    courseRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    courseStudentRepoMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      create: jest.fn().mockImplementation((data) => data),
    };

    lecturerRepoMock = {
      findOne: jest.fn(),
    };

    studentRepoMock = {
      findOne: jest.fn(),
    };

    cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(true),
      scanAndInvalidate: jest.fn().mockResolvedValue(true),
    };

    dataSourceMock = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const managerMock = {
          findOne: jest.fn(),
          create: jest.fn().mockImplementation((_, data) => data),
          save: jest.fn().mockImplementation((_, data) => Promise.resolve(data)),
        };
        return cb(managerMock);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: getRepositoryToken(Course), useValue: courseRepoMock },
        { provide: getRepositoryToken(CourseStudent), useValue: courseStudentRepoMock },
        { provide: getRepositoryToken(Lecturer), useValue: lecturerRepoMock },
        { provide: getRepositoryToken(Student), useValue: studentRepoMock },
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: DataSource, useValue: dataSourceMock },
        { provide: QueueService, useValue: queueServiceMock },
      ],
    }).compile();

    service = module.get<CourseService>(CourseService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateCourseDto = {
      id: 'CPEN401',
      name: 'Embedded Systems',
      semester: 'First',
      lecturerId: 'uuid-1',
    };

    it('should throw ConflictException if course ID already exists', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CPEN401' });

      await expect(service.create(createDto)).rejects.toThrow(
        new ConflictException('Course with code "CPEN401" already exists'),
      );
    });

    it('should throw NotFoundException if lecturerId is provided but lecturer does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);
      lecturerRepoMock.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(
        new NotFoundException('Lecturer with ID "uuid-1" not found'),
      );
    });

    it('should successfully create course and invalidate cache', async () => {
      courseRepoMock.findOne
        .mockResolvedValueOnce(null) // existence check
        .mockResolvedValueOnce({ id: 'CPEN401', name: 'Embedded Systems' }); // findById in return
      lecturerRepoMock.findOne.mockResolvedValue({ id: 'uuid-1', name: 'Dr. Turing' });

      const result = await service.create(createDto);

      expect(courseRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'CPEN401',
          name: 'Embedded Systems',
          lecturerId: 'uuid-1',
          semester: 'First',
        }),
      );
      expect(courseRepoMock.save).toHaveBeenCalled();
      expect(queueServiceMock.enrollAllStudentsInCourse).toHaveBeenCalledWith('CPEN401');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:courses:*');
      expect(result.id).toBe('CPEN401');
    });

    it('should create course without lecturerId when lecturerId is omitted', async () => {
      courseRepoMock.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'MATH101', name: 'Calculus' });

      const result = await service.create({
        id: 'MATH101',
        name: 'Calculus',
        semester: 'First',
      });

      expect(lecturerRepoMock.findOne).not.toHaveBeenCalled();
      expect(result.id).toBe('MATH101');
    });
  });

  describe('findPaginated', () => {
    it('should return cached result immediately on cache hit', async () => {
      const cached = {
        items: [{ id: 'CPEN401' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.findPaginated({ page: 1, limit: 20 });

      expect(result).toBe(cached);
      expect(courseRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss with default parameters and cache result', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const items = [{ id: 'CPEN401' }];
      queryBuilderMock.getManyAndCount.mockResolvedValue([items, 1]);

      const result = await service.findPaginated({} as CourseQueryDto);

      expect(courseRepoMock.createQueryBuilder).toHaveBeenCalledWith('course');
      expect(queryBuilderMock.leftJoinAndSelect).toHaveBeenCalledWith('course.lecturer', 'lecturer');
      expect(queryBuilderMock.orderBy).toHaveBeenCalledWith('course.id', 'ASC');
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(0);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(20);
      expect(cacheServiceMock.set).toHaveBeenCalled();
      expect(result.items).toEqual(items);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should apply search, semester, day, and lecturerId filters and calculate pagination', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const items = [{ id: 'CPEN401' }];
      queryBuilderMock.getManyAndCount.mockResolvedValue([items, 45]);

      const query: CourseQueryDto = {
        page: 2,
        limit: 10,
        search: 'Embedded',
        semester: 'First',
        day: 'Monday',
        lecturerId: 'uuid-1',
      };

      const result = await service.findPaginated(query);

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(LOWER(course.id) LIKE LOWER(:search) OR LOWER(course.name) LIKE LOWER(:search))',
        { search: '%Embedded%' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'LOWER(course.semester) = LOWER(:semester)',
        { semester: 'First' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'LOWER(course.day) = LOWER(:day)',
        { day: 'Monday' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'course.lecturerId = :lecturerId',
        { lecturerId: 'uuid-1' },
      );
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(true);
    });

    it('should default totalPages to 1 when total is 0', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated({ page: 1, limit: 10 });

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findById', () => {
    it('should return course with lecturer when found', async () => {
      const course = { id: 'CPEN401', name: 'Embedded Systems', lecturer: { name: 'Dr. Turing' } };
      courseRepoMock.findOne.mockResolvedValue(course);

      const result = await service.findById('cpen401');

      expect(courseRepoMock.findOne).toHaveBeenCalledWith({
        where: { id: 'CPEN401' },
        relations: ['lecturer'],
      });
      expect(result).toBe(course);
    });

    it('should throw NotFoundException when course is not found', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(service.findById('UNKNOWN')).rejects.toThrow(
        new NotFoundException('Course with code "UNKNOWN" not found'),
      );
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(service.update('UNKNOWN', { name: 'New Name' })).rejects.toThrow(
        new NotFoundException('Course with code "UNKNOWN" not found'),
      );
    });

    it('should throw NotFoundException if updated lecturerId does not exist', async () => {
      const course = { id: 'CPEN401', name: 'Embedded Systems' };
      courseRepoMock.findOne.mockResolvedValue(course);
      lecturerRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.update('CPEN401', { lecturerId: 'missing-uuid' }),
      ).rejects.toThrow(
        new NotFoundException('Lecturer with ID "missing-uuid" not found'),
      );
    });

    it('should update course, invalidate caches, and return updated course', async () => {
      const currentCourse = { id: 'CPEN401', name: 'Old Name' };
      const updatedCourse = { id: 'CPEN401', name: 'New Name' };

      courseRepoMock.findOne
        .mockResolvedValueOnce(currentCourse) // findById in update
        .mockResolvedValueOnce(updatedCourse); // findById after update

      const result = await service.update('CPEN401', { name: 'New Name' });

      expect(courseRepoMock.update).toHaveBeenCalledWith(
        'CPEN401',
        expect.objectContaining({ name: 'New Name', updatedAt: expect.any(Date) }),
      );
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:courses:*');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:student-courses:*');
      expect(result).toBe(updatedCourse);
    });

    it('should update with valid lecturerId and verify lecturer', async () => {
      const currentCourse = { id: 'CPEN401', name: 'Embedded Systems' };
      const updatedCourse = { id: 'CPEN401', lecturerId: 'uuid-valid' };

      courseRepoMock.findOne
        .mockResolvedValueOnce(currentCourse)
        .mockResolvedValueOnce(updatedCourse);
      lecturerRepoMock.findOne.mockResolvedValue({ id: 'uuid-valid' });

      const result = await service.update('CPEN401', { lecturerId: 'uuid-valid' });

      expect(lecturerRepoMock.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-valid' } });
      expect(result).toBe(updatedCourse);
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(service.delete('UNKNOWN')).rejects.toThrow(
        new NotFoundException('Course with code "UNKNOWN" not found'),
      );
    });

    it('should delete course and invalidate caches', async () => {
      const course = { id: 'CPEN401', name: 'To Delete' };
      courseRepoMock.findOne.mockResolvedValue(course);

      const result = await service.delete('CPEN401');

      expect(courseRepoMock.delete).toHaveBeenCalledWith('CPEN401');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:courses:*');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:student-courses:*');
      expect(result.message).toBe('Course "CPEN401" successfully deleted');
    });
  });

  describe('enrollStudent', () => {
    it('should throw NotFoundException if course does not exist in transaction', async () => {
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await expect(service.enrollStudent('CPEN401', 'std_01')).rejects.toThrow(
        new NotFoundException('Course with code "CPEN401" not found'),
      );
    });

    it('should throw ConflictException if student is already enrolled (isRegister: true)', async () => {
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: 'CPEN401' }) // course found
            .mockResolvedValueOnce({ courseId: 'CPEN401', studentId: 'std_01', isRegister: true }), // already enrolled
        };
        return cb(manager);
      });

      await expect(service.enrollStudent('CPEN401', 'std_01')).rejects.toThrow(
        new ConflictException('Already enrolled in course "CPEN401"'),
      );
    });

    it('should reactivate enrollment if student was previously unenrolled (isRegister: false)', async () => {
      let savedData: any = null;
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const existing = { courseId: 'CPEN401', studentId: 'std_01', isRegister: false };
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: 'CPEN401' })
            .mockResolvedValueOnce(existing),
          save: jest.fn().mockImplementation((_, data) => {
            savedData = data;
            return Promise.resolve(data);
          }),
        };
        return cb(manager);
      });

      const result = await service.enrollStudent('CPEN401', 'std_01');

      expect(savedData.isRegister).toBe(true);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:student-courses:std_01:*');
      expect(result.courseId).toBe('CPEN401');
    });

    it('should create new enrollment if no previous enrollment existed', async () => {
      let createdData: any = null;
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest
            .fn()
            .mockResolvedValueOnce({ id: 'CPEN401' })
            .mockResolvedValueOnce(null), // no existing record
          create: jest.fn().mockImplementation((_, data) => {
            createdData = data;
            return data;
          }),
          save: jest.fn().mockImplementation((_, data) => Promise.resolve(data)),
        };
        return cb(manager);
      });

      const result = await service.enrollStudent('CPEN401', 'std_01');

      expect(createdData.courseId).toBe('CPEN401');
      expect(createdData.studentId).toBe('std_01');
      expect(createdData.isRegister).toBe(true);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:student-courses:std_01:*');
      expect(result.message).toContain('Successfully enrolled');
    });
  });

  describe('unenrollStudent', () => {
    it('should throw NotFoundException if enrollment record does not exist', async () => {
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue(null),
        };
        return cb(manager);
      });

      await expect(service.unenrollStudent('CPEN401', 'std_01')).rejects.toThrow(
        new NotFoundException('You are not currently enrolled in course "CPEN401"'),
      );
    });

    it('should throw NotFoundException if enrollment record has isRegister: false', async () => {
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const manager = {
          findOne: jest.fn().mockResolvedValue({ isRegister: false }),
        };
        return cb(manager);
      });

      await expect(service.unenrollStudent('CPEN401', 'std_01')).rejects.toThrow(
        new NotFoundException('You are not currently enrolled in course "CPEN401"'),
      );
    });

    it('should set isRegister to false, save, and invalidate cache', async () => {
      let savedData: any = null;
      dataSourceMock.transaction.mockImplementation(async (cb) => {
        const existing = { courseId: 'CPEN401', studentId: 'std_01', isRegister: true };
        const manager = {
          findOne: jest.fn().mockResolvedValue(existing),
          save: jest.fn().mockImplementation((_, data) => {
            savedData = data;
            return Promise.resolve(data);
          }),
        };
        return cb(manager);
      });

      const result = await service.unenrollStudent('CPEN401', 'std_01');

      expect(savedData.isRegister).toBe(false);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:student-courses:std_01:*');
      expect(result.message).toContain('Successfully unenrolled');
    });
  });

  describe('getStudentCourses', () => {
    it('should return cached enrolled courses on cache hit', async () => {
      const cached = [{ id: 'CPEN401' }];
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.getStudentCourses('std_01');

      expect(result).toBe(cached);
      expect(courseStudentRepoMock.find).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss, cache courses, and return them', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const enrollments = [
        { course: { id: 'CPEN401', name: 'Embedded Systems' } },
        { course: null }, // edge case: deleted course
      ];
      courseStudentRepoMock.find.mockResolvedValue(enrollments);

      const result = await service.getStudentCourses('std_01');

      expect(courseStudentRepoMock.find).toHaveBeenCalledWith({
        where: { studentId: 'std_01', isRegister: true },
        relations: ['course', 'course.lecturer'],
      });
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        'cr:student-courses:std_01:enrolled',
        [{ id: 'CPEN401', name: 'Embedded Systems' }],
        900,
      );
      expect(result).toEqual([{ id: 'CPEN401', name: 'Embedded Systems' }]);
    });
  });

  describe('getCourseRoster', () => {
    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(service.getCourseRoster('UNKNOWN')).rejects.toThrow(
        new NotFoundException('Course with code "UNKNOWN" not found'),
      );
    });

    it('should return enrolled students for a valid course', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CPEN401' });
      const enrollments = [
        { student: { id: 'std_01', name: 'Student 1' } },
        { student: null }, // edge case: deleted student
      ];
      courseStudentRepoMock.find.mockResolvedValue(enrollments);

      const result = await service.getCourseRoster('CPEN401');

      expect(courseStudentRepoMock.find).toHaveBeenCalledWith({
        where: { courseId: 'CPEN401', isRegister: true },
        relations: ['student'],
      });
      expect(result).toEqual([{ id: 'std_01', name: 'Student 1' }]);
    });
  });
});

