import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { StudentController } from './student.controller';
import { StudentService } from './student.service';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { StudentQueryDto, RepUpdateStudentDto } from './dto';
import { Student, StudentStatus } from './entities/student.entity';

describe('StudentController', () => {
  let controller: StudentController;
  let studentServiceMock: {
    findById: jest.Mock;
    findPaginated: jest.Mock;
    repUpdate: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    studentServiceMock = {
      findById: jest.fn(),
      findPaginated: jest.fn(),
      repUpdate: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentController],
      providers: [
        {
          provide: StudentService,
          useValue: studentServiceMock,
        },
      ],
    }).compile();

    controller = module.get<StudentController>(StudentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyProfile', () => {
    const user: AuthenticatedUser = {
      id: 'std_01',
      email: 'john@uni.edu',
      name: 'John Doe',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };

    it('should return student profile when found', async () => {
      const student: Partial<Student> = {
        id: 'std_01',
        name: 'John Doe',
        email: 'john@uni.edu',
        status: StudentStatus.ACTIVE,
      };
      studentServiceMock.findById.mockResolvedValue(student);

      const result = await controller.getMyProfile(user);

      expect(studentServiceMock.findById).toHaveBeenCalledWith('std_01');
      expect(result).toBe(student);
    });

    it('should throw NotFoundException when profile is not found', async () => {
      studentServiceMock.findById.mockResolvedValue(null);

      await expect(controller.getMyProfile(user)).rejects.toThrow(
        new NotFoundException('Student profile not found'),
      );
    });
  });

  describe('getStudentById', () => {
    it('should return student by id when found', async () => {
      const student: Partial<Student> = {
        id: 'std_02',
        name: 'Jane Doe',
        email: 'jane@uni.edu',
        status: StudentStatus.ACTIVE,
      };
      studentServiceMock.findById.mockResolvedValue(student);

      const result = await controller.getStudentById('std_02');

      expect(studentServiceMock.findById).toHaveBeenCalledWith('std_02');
      expect(result).toBe(student);
    });

    it('should throw NotFoundException when student is not found', async () => {
      studentServiceMock.findById.mockResolvedValue(null);

      await expect(controller.getStudentById('missing_id')).rejects.toThrow(
        new NotFoundException('Student with ID "missing_id" not found'),
      );
    });
  });

  describe('getStudents', () => {
    it('should delegate to studentService.findPaginated and return directory', async () => {
      const query: StudentQueryDto = { page: 1, limit: 10, search: 'Jane' };
      const paginatedResult = {
        items: [{ id: 'std_02' }],
        meta: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
      studentServiceMock.findPaginated.mockResolvedValue(paginatedResult);

      const result = await controller.getStudents(query);

      expect(studentServiceMock.findPaginated).toHaveBeenCalledWith(query);
      expect(result).toBe(paginatedResult);
    });
  });

  describe('updateStudent', () => {
    it('should delegate to studentService.repUpdate and return updated student', async () => {
      const dto: RepUpdateStudentDto = { name: 'Updated Jane' };
      const updatedStudent = { id: 'std_02', name: 'Updated Jane' };
      studentServiceMock.repUpdate.mockResolvedValue(updatedStudent);

      const result = await controller.updateStudent('std_02', dto);

      expect(studentServiceMock.repUpdate).toHaveBeenCalledWith('std_02', dto);
      expect(result).toBe(updatedStudent);
    });
  });

  describe('deleteStudent', () => {
    it('should delegate to studentService.delete and return confirmation', async () => {
      const response = { message: 'Student "std_02" successfully deleted' };
      studentServiceMock.delete.mockResolvedValue(response);

      const result = await controller.deleteStudent('std_02');

      expect(studentServiceMock.delete).toHaveBeenCalledWith('std_02');
      expect(result).toBe(response);
    });
  });
});

