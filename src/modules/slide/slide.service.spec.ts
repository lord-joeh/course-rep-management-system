import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Readable } from 'stream';
import * as crypto from 'crypto';

import { SlideService } from './slide.service';
import { Slide } from './entities/slide.entity';
import { Course } from '../course/entities/course.entity';
import { GoogleDriveService } from '../google/services/google-drive.service';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import { DriveJobType } from '../queue/constants';
import { CACHE_TTL } from '../../common/constants/cache.constants';

describe('SlideService', () => {
  let service: SlideService;
  let slideRepoMock: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let courseRepoMock: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let googleDriveServiceMock: {
    createFolder: jest.Mock;
    uploadFileStream: jest.Mock;
    downloadFileStream: jest.Mock;
    deleteFile: jest.Mock;
    searchFilesInFolder: jest.Mock;
  };
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    scanAndInvalidate: jest.Mock;
  };
  let queueServiceMock: {
    uploadToDrive: jest.Mock;
    deleteFromDrive: jest.Mock;
  };

  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    slideRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    courseRepoMock = {
      findOne: jest.fn(),
      save: jest.fn((c) => Promise.resolve(c)),
    };

    googleDriveServiceMock = {
      createFolder: jest.fn().mockResolvedValue({ id: 'auto_folder_123', name: 'CS101 Slides' }),
      uploadFileStream: jest.fn(),
      downloadFileStream: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue({}),
      searchFilesInFolder: jest.fn().mockResolvedValue([]),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(true),
      scanAndInvalidate: jest.fn().mockResolvedValue(true),
    };

    queueServiceMock = {
      uploadToDrive: jest.fn().mockResolvedValue('job-drive-upload-1'),
      deleteFromDrive: jest.fn().mockResolvedValue('job-drive-delete-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlideService,
        {
          provide: getRepositoryToken(Slide),
          useValue: slideRepoMock,
        },
        {
          provide: getRepositoryToken(Course),
          useValue: courseRepoMock,
        },
        {
          provide: GoogleDriveService,
          useValue: googleDriveServiceMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
        {
          provide: QueueService,
          useValue: queueServiceMock,
        },
        {
          provide: NotificationDispatcherService,
          useValue: {
            dispatchSlideUploaded: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<SlideService>(SlideService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadSlides', () => {
    const mockFile1: Express.Multer.File = {
      fieldname: 'files',
      originalname: 'Lecture1.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: Buffer.from('lecture 1 content'),
      size: 17,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    it('should throw BadRequestException if files array is null or empty', async () => {
      await expect(service.uploadSlides([], 'CS101')).rejects.toThrow(
        new BadRequestException('No slide files provided for upload'),
      );
      await expect(service.uploadSlides(null as any, 'CS101')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if files count exceeds 10', async () => {
      const elevenFiles = Array(11).fill(mockFile1);
      await expect(service.uploadSlides(elevenFiles, 'CS101')).rejects.toThrow(
        new BadRequestException('Cannot upload more than 10 slides at a time'),
      );
    });

    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(service.uploadSlides([mockFile1], 'NON_EXISTENT')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should auto-create Drive folder if course has no slidesFolderId and no folderId passed', async () => {
      const courseWithoutFolder = { id: 'CS101', slidesFolderId: null };
      courseRepoMock.findOne.mockResolvedValue(courseWithoutFolder);

      const result = await service.uploadSlides([mockFile1], 'CS101');

      expect(googleDriveServiceMock.createFolder).toHaveBeenCalledWith('CS101 Slides');
      expect(courseWithoutFolder.slidesFolderId).toBe('auto_folder_123');
      expect(courseRepoMock.save).toHaveBeenCalledWith(courseWithoutFolder);
      expect(queueServiceMock.uploadToDrive).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DriveJobType.UPLOAD_SLIDE_FILE,
          courseId: 'CS101',
          folderId: 'auto_folder_123',
          fileName: 'Lecture1.pdf',
        }),
      );
      expect(result.uploaded).toHaveLength(1);
    });

    it('should use explicitly passed folderId if provided', async () => {
      const course = { id: 'CS101', slidesFolderId: 'default_folder' };
      courseRepoMock.findOne.mockResolvedValue(course);

      await service.uploadSlides([mockFile1], 'CS101', 'custom_folder_999');

      expect(googleDriveServiceMock.createFolder).not.toHaveBeenCalled();
      expect(queueServiceMock.uploadToDrive).toHaveBeenCalledWith(
        expect.objectContaining({
          type: DriveJobType.UPLOAD_SLIDE_FILE,
          courseId: 'CS101',
          folderId: 'custom_folder_999',
          fileName: 'Lecture1.pdf',
        }),
      );
    });

    it('should skip duplicate files based on in-memory SHA-256 pre-check', async () => {
      const course = { id: 'CS101', slidesFolderId: 'folder_abc' };
      courseRepoMock.findOne.mockResolvedValue(course);

      const hash1 = crypto.createHash('sha256').update(mockFile1.buffer).digest('hex');
      // Simulate existing slide with identical hash
      slideRepoMock.find.mockResolvedValue([
        { id: 'existing_uuid', fileName: 'OldLecture.pdf', courseId: 'CS101', hash: hash1 },
      ]);

      const result = await service.uploadSlides([mockFile1], 'CS101');

      expect(result.duplicatesSkipped).toEqual([
        { fileName: 'Lecture1.pdf', hash: hash1 },
      ]);
      expect(result.uploaded).toHaveLength(0);
      expect(queueServiceMock.uploadToDrive).not.toHaveBeenCalled();
      expect(slideRepoMock.save).not.toHaveBeenCalled();
    });

    it('should execute parallel uploads and enqueue jobs to BullMQ', async () => {
      const course = { id: 'CS101', slidesFolderId: 'folder_abc' };
      courseRepoMock.findOne.mockResolvedValue(course);

      const mockFile2: Express.Multer.File = {
        ...mockFile1,
        originalname: 'Lecture2.pdf',
        buffer: Buffer.from('lecture 2 content'),
      };

      slideRepoMock.save.mockImplementation((entities) => Promise.resolve(entities));

      const result = await service.uploadSlides([mockFile1, mockFile2], 'CS101');

      expect(result.uploaded).toHaveLength(2);
      expect(queueServiceMock.uploadToDrive).toHaveBeenCalledTimes(2);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:slides:course:CS101:*');
    });
  });

  describe('findSlidesByCourse', () => {
    it('should return cached result when available in Redis', async () => {
      const cachedResult = { items: [{ id: 'slide1' }], meta: { total: 1 } };
      cacheServiceMock.get.mockResolvedValue(cachedResult);

      const result = await service.findSlidesByCourse({ courseId: 'CS101', page: 1, limit: 10 });

      expect(result).toBe(cachedResult);
      expect(courseRepoMock.findOne).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if course does not exist on cache miss', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.findSlidesByCourse({ courseId: 'UNKNOWN', page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should query slides with pagination and search, and cache result', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      courseRepoMock.findOne.mockResolvedValue({ id: 'CS101' });

      const mockSlides = [
        { id: 's1', fileName: 'Intro to Algorithms.pdf', createdAt: new Date() },
      ];
      queryBuilderMock.getManyAndCount.mockResolvedValue([mockSlides, 1]);

      const result = await service.findSlidesByCourse({
        courseId: 'CS101',
        search: 'algorithms',
        page: 1,
        limit: 10,
      });

      expect(result.items).toEqual(mockSlides);
      expect(result.meta.total).toBe(1);
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'slide.fileName ILIKE :search',
        { search: '%algorithms%' },
      );
      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        'cr:slides:course:CS101:page:1:limit:10:search:algorithms',
        expect.any(Object),
        CACHE_TTL.ONE_HOUR,
      );
    });

    it('should default pagination parameters if omitted', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      courseRepoMock.findOne.mockResolvedValue({ id: 'CS101' });
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findSlidesByCourse({ courseId: 'CS101', page: 1, limit: 10 });

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(queryBuilderMock.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('downloadSlideStream', () => {
    it('should throw NotFoundException if slide does not exist', async () => {
      slideRepoMock.findOne.mockResolvedValue(null);

      await expect(service.downloadSlideStream('missing_uuid')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delegate to GoogleDriveService.downloadFileStream with driveFileId', async () => {
      slideRepoMock.findOne.mockResolvedValue({
        id: 'valid_uuid',
        driveFileId: 'drive_asset_123',
      });

      const mockDownload = {
        stream: new Readable({ read() { this.push(null); } }),
        fileName: 'Lecture.pdf',
        mimeType: 'application/pdf',
      };
      googleDriveServiceMock.downloadFileStream.mockResolvedValue(mockDownload);

      const result = await service.downloadSlideStream('valid_uuid');

      expect(result).toBe(mockDownload);
      expect(googleDriveServiceMock.downloadFileStream).toHaveBeenCalledWith('drive_asset_123');
    });
  });

  describe('deleteSlide', () => {
    it('should throw NotFoundException if slide does not exist', async () => {
      slideRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteSlide('missing_id')).rejects.toThrow(NotFoundException);
    });

    it('should delete asset from Drive via queue, remove record from db, and invalidate cache', async () => {
      const mockSlide = {
        id: 'slide_to_delete',
        driveFileId: 'drive_del_123',
        courseId: 'CS101',
      };
      slideRepoMock.findOne.mockResolvedValue(mockSlide);

      const result = await service.deleteSlide('slide_to_delete');

      expect(result).toEqual({
        message: 'Slide deleted successfully',
        slideId: 'slide_to_delete',
      });
      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('drive_del_123', undefined, {
        slideId: 'slide_to_delete',
      });
      expect(slideRepoMock.remove).toHaveBeenCalledWith(mockSlide);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:slides:course:CS101:*');
    });

    it('should skip queue delete if slide driveFileId is pending', async () => {
      const mockSlide = {
        id: 'slide_drive_err',
        driveFileId: 'pending',
        courseId: 'CS101',
      };
      slideRepoMock.findOne.mockResolvedValue(mockSlide);

      const result = await service.deleteSlide('slide_drive_err');

      expect(result.slideId).toBe('slide_drive_err');
      expect(queueServiceMock.deleteFromDrive).not.toHaveBeenCalled();
      expect(slideRepoMock.remove).toHaveBeenCalledWith(mockSlide);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:slides:course:CS101:*');
    });
  });

  describe('searchFilesInFolder', () => {
    it('should delegate to GoogleDriveService.searchFilesInFolder', async () => {
      const mockFiles = [{ id: 'f1', name: 'Slide.pdf' }];
      googleDriveServiceMock.searchFilesInFolder.mockResolvedValue(mockFiles);

      const result = await service.searchFilesInFolder('folder_999');

      expect(result).toBe(mockFiles);
      expect(googleDriveServiceMock.searchFilesInFolder).toHaveBeenCalledWith('folder_999');
    });
  });
});
