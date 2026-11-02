import { Test, TestingModule } from '@nestjs/testing';
import { CourseController } from './course.controller';
import { CourseService } from './course.service';
import { CreateCourseDto, UpdateCourseDto, CourseQueryDto } from './dto';
import { Course } from './entities/course.entity';
import { Student } from '../student/entities/student.entity';

describe('CourseController', () => {
  let controller: CourseController;
  let courseServiceMock: {
    findPaginated: jest.Mock;
    getStudentCourses: jest.Mock;
    findById: jest.Mock;
    getCourseRoster: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    enrollStudent: jest.Mock;
    unenrollStudent: jest.Mock;
  };

  beforeEach(async () => {
    courseServiceMock = {
      findPaginated: jest.fn(),
      getStudentCourses: jest.fn(),
      findById: jest.fn(),
      getCourseRoster: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      enrollStudent: jest.fn(),
      unenrollStudent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CourseController],
      providers: [
        {
          provide: CourseService,
          useValue: courseServiceMock,
        },
      ],
    }).compile();

    controller = module.get<CourseController>(CourseController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCourses', () => {
    it('should delegate to courseService.findPaginated and return catalog', async () => {
      const query: CourseQueryDto = { page: 1, limit: 10, search: 'Systems' };
      const paginatedResult = {
        items: [{ id: 'CPEN401', name: 'Embedded Systems' }],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      courseServiceMock.findPaginated.mockResolvedValue(paginatedResult);

      const result = await controller.getCourses(query);

      expect(courseServiceMock.findPaginated).toHaveBeenCalledWith(query);
      expect(result).toBe(paginatedResult);
    });
  });

  describe('getMyCourses', () => {
    it('should delegate to courseService.getStudentCourses with studentId', async () => {
      const courses: Partial<Course>[] = [{ id: 'CPEN401', name: 'Embedded Systems' }];
      courseServiceMock.getStudentCourses.mockResolvedValue(courses);

      const result = await controller.getMyCourses('std_01');

      expect(courseServiceMock.getStudentCourses).toHaveBeenCalledWith('std_01');
      expect(result).toBe(courses);
    });
  });

  describe('getCourseById', () => {
    it('should delegate to courseService.findById with courseId', async () => {
      const course: Partial<Course> = { id: 'CPEN401', name: 'Embedded Systems' };
      courseServiceMock.findById.mockResolvedValue(course);

      const result = await controller.getCourseById('CPEN401');

      expect(courseServiceMock.findById).toHaveBeenCalledWith('CPEN401');
      expect(result).toBe(course);
    });
  });

  describe('getCourseRoster', () => {
    it('should delegate to courseService.getCourseRoster with courseId', async () => {
      const roster: Partial<Student>[] = [{ id: 'std_01', name: 'John Doe' }];
      courseServiceMock.getCourseRoster.mockResolvedValue(roster);

      const result = await controller.getCourseRoster('CPEN401');

      expect(courseServiceMock.getCourseRoster).toHaveBeenCalledWith('CPEN401');
      expect(result).toBe(roster);
    });
  });

  describe('createCourse', () => {
    it('should delegate to courseService.create with dto', async () => {
      const dto: CreateCourseDto = {
        id: 'CPEN401',
        name: 'Embedded Systems',
        semester: 'First',
      };
      const createdCourse: Partial<Course> = { ...dto };
      courseServiceMock.create.mockResolvedValue(createdCourse);

      const result = await controller.createCourse(dto);

      expect(courseServiceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(createdCourse);
    });
  });

  describe('updateCourse', () => {
    it('should delegate to courseService.update with id and dto', async () => {
      const dto: UpdateCourseDto = { name: 'Advanced Embedded Systems' };
      const updatedCourse: Partial<Course> = { id: 'CPEN401', name: 'Advanced Embedded Systems' };
      courseServiceMock.update.mockResolvedValue(updatedCourse);

      const result = await controller.updateCourse('CPEN401', dto);

      expect(courseServiceMock.update).toHaveBeenCalledWith('CPEN401', dto);
      expect(result).toBe(updatedCourse);
    });
  });

  describe('deleteCourse', () => {
    it('should delegate to courseService.delete with id', async () => {
      const response = { message: 'Course "CPEN401" successfully deleted' };
      courseServiceMock.delete.mockResolvedValue(response);

      const result = await controller.deleteCourse('CPEN401');

      expect(courseServiceMock.delete).toHaveBeenCalledWith('CPEN401');
      expect(result).toBe(response);
    });
  });

  describe('enroll', () => {
    it('should delegate to courseService.enrollStudent with courseId and studentId', async () => {
      const response = {
        message: 'Successfully enrolled in course "CPEN401"',
        courseId: 'CPEN401',
      };
      courseServiceMock.enrollStudent.mockResolvedValue(response);

      const result = await controller.enroll('CPEN401', 'std_01');

      expect(courseServiceMock.enrollStudent).toHaveBeenCalledWith('CPEN401', 'std_01');
      expect(result).toBe(response);
    });
  });

  describe('unenroll', () => {
    it('should delegate to courseService.unenrollStudent with courseId and studentId', async () => {
      const response = {
        message: 'Successfully unenrolled from course "CPEN401"',
        courseId: 'CPEN401',
      };
      courseServiceMock.unenrollStudent.mockResolvedValue(response);

      const result = await controller.unenroll('CPEN401', 'std_01');

      expect(courseServiceMock.unenrollStudent).toHaveBeenCalledWith('CPEN401', 'std_01');
      expect(result).toBe(response);
    });
  });
});

