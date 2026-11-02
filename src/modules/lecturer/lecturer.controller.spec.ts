import { Test, TestingModule } from '@nestjs/testing';
import { LecturerController } from './lecturer.controller';
import { LecturerService } from './lecturer.service';
import { CreateLecturerDto, UpdateLecturerDto, LecturerQueryDto } from './dto';
import { Lecturer } from './entities/lecturer.entity';

describe('LecturerController', () => {
  let controller: LecturerController;
  let lecturerServiceMock: {
    findPaginated: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    lecturerServiceMock = {
      findPaginated: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LecturerController],
      providers: [
        {
          provide: LecturerService,
          useValue: lecturerServiceMock,
        },
      ],
    }).compile();

    controller = module.get<LecturerController>(LecturerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getLecturers', () => {
    it('should delegate to lecturerService.findPaginated and return directory', async () => {
      const query: LecturerQueryDto = { page: 1, limit: 10, search: 'Smith' };
      const paginatedResult = {
        items: [{ id: 'uuid-1', name: 'Dr. Smith' }],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      lecturerServiceMock.findPaginated.mockResolvedValue(paginatedResult);

      const result = await controller.getLecturers(query);

      expect(lecturerServiceMock.findPaginated).toHaveBeenCalledWith(query);
      expect(result).toBe(paginatedResult);
    });
  });

  describe('getLecturerById', () => {
    it('should delegate to lecturerService.findById and return lecturer details', async () => {
      const lecturer: Partial<Lecturer> = {
        id: 'uuid-1',
        name: 'Dr. Smith',
        email: 'smith@faculty.uni.edu',
      };
      lecturerServiceMock.findById.mockResolvedValue(lecturer);

      const result = await controller.getLecturerById('uuid-1');

      expect(lecturerServiceMock.findById).toHaveBeenCalledWith('uuid-1');
      expect(result).toBe(lecturer);
    });
  });

  describe('createLecturer', () => {
    it('should delegate to lecturerService.create and return created lecturer', async () => {
      const dto: CreateLecturerDto = {
        name: 'Dr. Jane Smith',
        email: 'jane.smith@faculty.uni.edu',
        phone: '+123456789',
      };
      const createdLecturer: Partial<Lecturer> = {
        id: 'uuid-new',
        ...dto,
      };
      lecturerServiceMock.create.mockResolvedValue(createdLecturer);

      const result = await controller.createLecturer(dto);

      expect(lecturerServiceMock.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(createdLecturer);
    });
  });

  describe('updateLecturer', () => {
    it('should delegate to lecturerService.update and return updated lecturer', async () => {
      const dto: UpdateLecturerDto = {
        name: 'Prof. Jane Smith',
      };
      const updatedLecturer: Partial<Lecturer> = {
        id: 'uuid-1',
        name: 'Prof. Jane Smith',
        email: 'jane.smith@faculty.uni.edu',
      };
      lecturerServiceMock.update.mockResolvedValue(updatedLecturer);

      const result = await controller.updateLecturer('uuid-1', dto);

      expect(lecturerServiceMock.update).toHaveBeenCalledWith('uuid-1', dto);
      expect(result).toBe(updatedLecturer);
    });
  });

  describe('deleteLecturer', () => {
    it('should delegate to lecturerService.delete and return confirmation message', async () => {
      const response = { message: 'Lecturer "uuid-1" successfully deleted' };
      lecturerServiceMock.delete.mockResolvedValue(response);

      const result = await controller.deleteLecturer('uuid-1');

      expect(lecturerServiceMock.delete).toHaveBeenCalledWith('uuid-1');
      expect(result).toBe(response);
    });
  });
});

