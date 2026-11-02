import { NotFoundException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LecturerService } from './lecturer.service';
import { Lecturer } from './entities/lecturer.entity';
import { CacheService } from '../redis/cache.service';
import { CreateLecturerDto, UpdateLecturerDto, LecturerQueryDto } from './dto';

describe('LecturerService', () => {
  let service: LecturerService;
  let lecturerRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    scanAndInvalidate: jest.Mock;
  };

  let queryBuilderMock: any;

  beforeEach(async () => {
    queryBuilderMock = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };

    lecturerRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(true),
      scanAndInvalidate: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LecturerService,
        { provide: getRepositoryToken(Lecturer), useValue: lecturerRepoMock },
        { provide: CacheService, useValue: cacheServiceMock },
      ],
    }).compile();

    service = module.get<LecturerService>(LecturerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateLecturerDto = {
      name: 'Dr. Jane Smith',
      email: 'jane.smith@faculty.uni.edu',
      phone: '+123456789',
    };

    it('should throw ConflictException if lecturer with email already exists', async () => {
      lecturerRepoMock.findOne.mockResolvedValue({ id: 'existing-uuid', email: 'jane.smith@faculty.uni.edu' });

      await expect(service.create(createDto)).rejects.toThrow(
        new ConflictException('Lecturer with email "jane.smith@faculty.uni.edu" already exists'),
      );
      expect(lecturerRepoMock.save).not.toHaveBeenCalled();
    });

    it('should create and persist lecturer and invalidate cache', async () => {
      lecturerRepoMock.findOne.mockResolvedValue(null);

      const result = await service.create(createDto);

      expect(lecturerRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Dr. Jane Smith',
          email: 'jane.smith@faculty.uni.edu',
          phone: '+123456789',
          id: expect.any(String),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        }),
      );
      expect(lecturerRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:lecturers:*');
      expect(result.name).toBe('Dr. Jane Smith');
    });
  });

  describe('findPaginated', () => {
    it('should return cached result immediately on cache hit', async () => {
      const cachedResult = {
        items: [{ id: 'uuid-1', name: 'Dr. Cached' }],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      };
      cacheServiceMock.get.mockResolvedValue(cachedResult);

      const result = await service.findPaginated({ page: 1, limit: 20 });

      expect(result).toBe(cachedResult);
      expect(lecturerRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query DB on cache miss with default pagination and cache result', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const items = [{ id: 'uuid-1', name: 'Dr. One' }];
      queryBuilderMock.getManyAndCount.mockResolvedValue([items, 1]);

      const result = await service.findPaginated({} as LecturerQueryDto);

      expect(lecturerRepoMock.createQueryBuilder).toHaveBeenCalledWith('lecturer');
      expect(queryBuilderMock.orderBy).toHaveBeenCalledWith('lecturer.createdAt', 'DESC');
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(0);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(20);
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        expect.stringContaining('cr:lecturers:p=1:l=20:s='),
        expect.objectContaining({ items }),
        900,
      );
      expect(result.items).toEqual(items);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should apply search filter and calculate multi-page pagination', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const items = [{ id: 'uuid-2' }];
      queryBuilderMock.getManyAndCount.mockResolvedValue([items, 35]);

      const result = await service.findPaginated({ page: 2, limit: 10, search: '  Jane  ' });

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(LOWER(lecturer.name) LIKE LOWER(:search) OR LOWER(lecturer.email) LIKE LOWER(:search) OR LOWER(lecturer.phone) LIKE LOWER(:search))',
        { search: '%Jane%' },
      );
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(10);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(10);
      expect(result.meta.page).toBe(2);
      expect(result.meta.totalPages).toBe(4);
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

  describe('findById', () => {
    it('should return lecturer when found', async () => {
      const lecturer = { id: 'uuid-1', name: 'Dr. Jane' };
      lecturerRepoMock.findOne.mockResolvedValue(lecturer);

      const result = await service.findById('uuid-1');

      expect(lecturerRepoMock.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1' } });
      expect(result).toBe(lecturer);
    });

    it('should throw NotFoundException when lecturer is not found', async () => {
      lecturerRepoMock.findOne.mockResolvedValue(null);

      await expect(service.findById('missing-uuid')).rejects.toThrow(
        new NotFoundException('Lecturer with ID "missing-uuid" not found'),
      );
    });
  });

  describe('findByEmail', () => {
    it('should find lecturer by lowercase email', async () => {
      const lecturer = { id: 'uuid-1', email: 'jane@uni.edu' };
      lecturerRepoMock.findOne.mockResolvedValue(lecturer);

      const result = await service.findByEmail('JANE@UNI.EDU');

      expect(lecturerRepoMock.findOne).toHaveBeenCalledWith({ where: { email: 'jane@uni.edu' } });
      expect(result).toBe(lecturer);
    });
  });

  describe('update', () => {
    it('should throw NotFoundException if lecturer does not exist', async () => {
      lecturerRepoMock.findOne.mockResolvedValue(null);

      await expect(service.update('missing-uuid', { name: 'New Name' })).rejects.toThrow(
        new NotFoundException('Lecturer with ID "missing-uuid" not found'),
      );
    });

    it('should throw ConflictException if updated email belongs to another lecturer', async () => {
      const currentLecturer = { id: 'uuid-1', email: 'current@uni.edu' };
      const conflictingLecturer = { id: 'uuid-2', email: 'other@uni.edu' };

      lecturerRepoMock.findOne
        .mockResolvedValueOnce(currentLecturer)
        .mockResolvedValueOnce(conflictingLecturer);

      await expect(
        service.update('uuid-1', { email: 'other@uni.edu' }),
      ).rejects.toThrow(
        new ConflictException('Email "other@uni.edu" is already used by another lecturer'),
      );
    });

    it('should allow updating without email change and invalidate cache', async () => {
      const currentLecturer = { id: 'uuid-1', email: 'current@uni.edu', name: 'Old Name' };
      const updatedLecturer = { id: 'uuid-1', email: 'current@uni.edu', name: 'New Name' };

      lecturerRepoMock.findOne
        .mockResolvedValueOnce(currentLecturer)
        .mockResolvedValueOnce(updatedLecturer);

      const result = await service.update('uuid-1', { name: 'New Name' });

      expect(lecturerRepoMock.update).toHaveBeenCalledWith(
        'uuid-1',
        expect.objectContaining({ name: 'New Name', updatedAt: expect.any(Date) }),
      );
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:lecturers:*');
      expect(result).toBe(updatedLecturer);
    });

    it('should allow updating to a new available email address', async () => {
      const currentLecturer = { id: 'uuid-1', email: 'current@uni.edu' };
      const updatedLecturer = { id: 'uuid-1', email: 'new@uni.edu' };

      lecturerRepoMock.findOne
        .mockResolvedValueOnce(currentLecturer)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(updatedLecturer);

      const result = await service.update('uuid-1', { email: 'NEW@UNI.EDU' });

      expect(lecturerRepoMock.update).toHaveBeenCalledWith(
        'uuid-1',
        expect.objectContaining({ email: 'new@uni.edu', updatedAt: expect.any(Date) }),
      );
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:lecturers:*');
      expect(result).toBe(updatedLecturer);
    });
  });

  describe('delete', () => {
    it('should throw NotFoundException if lecturer does not exist', async () => {
      lecturerRepoMock.findOne.mockResolvedValue(null);

      await expect(service.delete('missing-uuid')).rejects.toThrow(
        new NotFoundException('Lecturer with ID "missing-uuid" not found'),
      );
    });

    it('should delete lecturer and invalidate cache', async () => {
      const lecturer = { id: 'uuid-1', name: 'To Delete' };
      lecturerRepoMock.findOne.mockResolvedValue(lecturer);

      const result = await service.delete('uuid-1');

      expect(lecturerRepoMock.delete).toHaveBeenCalledWith('uuid-1');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:lecturers:*');
      expect(result.message).toBe('Lecturer "uuid-1" successfully deleted');
    });
  });
});

