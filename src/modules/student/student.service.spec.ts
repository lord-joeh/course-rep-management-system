import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { StudentService } from './student.service';
import { Student, StudentStatus } from './entities/student.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { CacheService } from '../redis/cache.service';
import { StudentQueryDto, RepUpdateStudentDto } from './dto';

describe('StudentService', () => {
  let service: StudentService;
  let studentRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let refreshTokenRepoMock: {
    delete: jest.Mock;
  };
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    scanAndInvalidate: jest.Mock;
  };

  let queryBuilderMock: any;

  beforeEach(async () => {
    queryBuilderMock = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
      getManyAndCount: jest.fn(),
    };

    studentRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    refreshTokenRepoMock = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(true),
      scanAndInvalidate: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentService,
        { provide: getRepositoryToken(Student), useValue: studentRepoMock },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepoMock },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<StudentService>(StudentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findById', () => {
    it('should find student by id', async () => {
      const student = { id: 'std_01', name: 'Student 1' };
      studentRepoMock.findOne.mockResolvedValue(student);

      const result = await service.findById('std_01');

      expect(studentRepoMock.findOne).toHaveBeenCalledWith({ where: { id: 'std_01' } });
      expect(result).toBe(student);
    });
  });

  describe('findByEmail', () => {
    it('should find student by lowercased email', async () => {
      const student = { id: 'std_01', email: 'test@student.edu' };
      studentRepoMock.findOne.mockResolvedValue(student);

      const result = await service.findByEmail('TEST@STUDENT.EDU');

      expect(studentRepoMock.findOne).toHaveBeenCalledWith({
        where: { email: 'test@student.edu' },
      });
      expect(result).toBe(student);
    });
  });

  describe('findByIdentifierWithPassword', () => {
    it('should query builder with passwordHash for id or email', async () => {
      const student = { id: 'std_01', passwordHash: 'hash' };
      queryBuilderMock.getOne.mockResolvedValue(student);

      const result = await service.findByIdentifierWithPassword('std_01');

      expect(studentRepoMock.createQueryBuilder).toHaveBeenCalledWith('student');
      expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('student.passwordHash');
      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'student.id = :identifier OR LOWER(student.email) = LOWER(:identifier)',
        { identifier: 'std_01' },
      );
      expect(result).toBe(student);
    });
  });

  describe('findByIdWithPassword', () => {
    it('should query builder with passwordHash for id', async () => {
      const student = { id: 'std_01', passwordHash: 'hash' };
      queryBuilderMock.getOne.mockResolvedValue(student);

      const result = await service.findByIdWithPassword('std_01');

      expect(studentRepoMock.createQueryBuilder).toHaveBeenCalledWith('student');
      expect(queryBuilderMock.addSelect).toHaveBeenCalledWith('student.passwordHash');
      expect(queryBuilderMock.where).toHaveBeenCalledWith('student.id = :id', { id: 'std_01' });
      expect(result).toBe(student);
    });
  });

  describe('create', () => {
    it('should normalize email to lowercase, set defaults, and persist student', async () => {
      const input = {
        id: 'std_new',
        name: 'New Student',
        email: 'NEW@STUDENT.EDU',
        passwordHash: 'hashed_pw',
      };

      const result = await service.create(input);

      expect(studentRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'std_new',
          name: 'New Student',
          email: 'new@student.edu',
          status: StudentStatus.ACTIVE,
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
      expect(studentRepoMock.save).toHaveBeenCalled();
      expect(result.id).toBe('std_new');
    });

    it('should handle student creation without email and with custom status and timestamps', async () => {
      const customTime = new Date('2026-01-01');
      const input = {
        id: 'std_no_email',
        name: 'No Email Student',
        status: StudentStatus.SUSPENDED,
        createdAt: customTime,
        updatedAt: customTime,
      };

      const result = await service.create(input);

      expect(studentRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'std_no_email',
          email: undefined,
          status: StudentStatus.SUSPENDED,
          createdAt: customTime,
          updatedAt: customTime,
        }),
      );
      expect(result.status).toBe(StudentStatus.SUSPENDED);
    });
  });

  describe('findPaginated', () => {
    it('should return cached results immediately on cache hit', async () => {
      const cachedResult = {
        items: [{ id: 'std_cached' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
      cacheServiceMock.get.mockResolvedValue(cachedResult);

      const query: StudentQueryDto = { page: 1, limit: 20 };
      const result = await service.findPaginated(query);

      expect(result).toBe(cachedResult);
      expect(studentRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss and cache result for 5 minutes (default pagination)', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const dbItems = [{ id: 'std_01' }, { id: 'std_02' }];
      queryBuilderMock.getManyAndCount.mockResolvedValue([dbItems, 2]);

      const result = await service.findPaginated({} as StudentQueryDto);

      expect(studentRepoMock.createQueryBuilder).toHaveBeenCalledWith('student');
      expect(queryBuilderMock.orderBy).toHaveBeenCalledWith('student.createdAt', 'DESC');
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(0);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(20);
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        expect.stringContaining('cr:students:p=1:l=20:s='),
        expect.objectContaining({ items: dbItems }),
        300,
      );
      expect(result.items).toEqual(dbItems);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);
    });

    it('should apply search, status, and isRep filters and calculate multi-page metadata', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([[{ id: 'std_02' }], 45]);

      const query: StudentQueryDto = {
        page: 2,
        limit: 10,
        search: '  John Doe  ',
        status: StudentStatus.ACTIVE,
        isRep: true,
      };

      const result = await service.findPaginated(query);

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(LOWER(student.name) LIKE LOWER(:search) OR LOWER(student.email) LIKE LOWER(:search) OR LOWER(student.id) LIKE LOWER(:search))',
        { search: '%John Doe%' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'student.status = :status',
        { status: StudentStatus.ACTIVE },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'student.isRep = :isRep',
        { isRep: true },
      );
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(10);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(10);
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(5);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(true);
    });

    it('should default totalPages to 1 when total count is 0', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findPaginated({ page: 1, limit: 10 });

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('repUpdate', () => {
    it('should throw NotFoundException if target student does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue(null);

      await expect(service.repUpdate('missing_id', { name: 'Name' })).rejects.toThrow(
        new NotFoundException('Student with ID "missing_id" not found'),
      );
    });

    it('should throw ConflictException if updated email is already taken by another student', async () => {
      const currentStudent = { id: 'std_01', email: 'old@uni.edu' };
      const conflictingStudent = { id: 'std_02', email: 'taken@uni.edu' };

      studentRepoMock.findOne
        .mockResolvedValueOnce(currentStudent)
        .mockResolvedValueOnce(conflictingStudent);

      await expect(
        service.repUpdate('std_01', { email: 'taken@uni.edu' }),
      ).rejects.toThrow(
        new ConflictException('Email "taken@uni.edu" is already used by another student'),
      );
    });

    it('should allow updating when email is unchanged or claimed by the same student', async () => {
      const currentStudent = { id: 'std_01', email: 'same@uni.edu', name: 'Old Name' };
      const updatedStudent = { id: 'std_01', email: 'same@uni.edu', name: 'New Name' };

      studentRepoMock.findOne
        .mockResolvedValueOnce(currentStudent)
        .mockResolvedValueOnce(updatedStudent);

      const result = await service.repUpdate('std_01', { name: 'New Name' });

      expect(studentRepoMock.update).toHaveBeenCalledWith(
        'std_01',
        expect.objectContaining({ name: 'New Name' }),
      );
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:students:*');
      expect(result).toEqual(updatedStudent);
    });

    it('should successfully update email to an untaken email address', async () => {
      const currentStudent = { id: 'std_01', email: 'current@uni.edu' };
      const updatedStudent = { id: 'std_01', email: 'new_unique@uni.edu' };

      studentRepoMock.findOne
        .mockResolvedValueOnce(currentStudent) // findById(studentId)
        .mockResolvedValueOnce(null)           // findByEmail(dto.email) -> null (available)
        .mockResolvedValueOnce(updatedStudent);// findById(studentId) after update

      const result = await service.repUpdate('std_01', { email: 'NEW_UNIQUE@UNI.EDU' });

      expect(studentRepoMock.update).toHaveBeenCalledWith(
        'std_01',
        expect.objectContaining({ email: 'new_unique@uni.edu' }),
      );
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:students:*');
      expect(result).toEqual(updatedStudent);
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if student does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue(null);

      await expect(service.delete('missing_id')).rejects.toThrow(
        new NotFoundException('Student with ID "missing_id" not found'),
      );
    });

    it('should cascade delete refresh tokens, delete student, and invalidate cache', async () => {
      const student = { id: 'std_01', name: 'To Delete' };
      studentRepoMock.findOne.mockResolvedValue(student);

      const result = await service.delete('std_01');

      expect(refreshTokenRepoMock.delete).toHaveBeenCalledWith({ studentId: 'std_01' });
      expect(studentRepoMock.delete).toHaveBeenCalledWith('std_01');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:students:*');
      expect(result.message).toBe('Student "std_01" successfully deleted');
    });
  });
});

