import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as fs from 'fs/promises';
import { DriveSyncProcessor } from './processors/drive-sync.processor';
import { GoogleDriveService } from '../google/services/google-drive.service';
import { Slide } from '../slide/entities/slide.entity';
import { Assignment } from '../assignment/entities/assignment.entity';
import { AssignmentSubmission } from '../assignment/entities/assignment-submission.entity';
import { DriveJobType } from './constants';
import { DriveJobData } from './dto';
import { CacheService } from '../redis/cache.service';

jest.mock('fs/promises');

describe('DriveSyncProcessor', () => {
  let processor: DriveSyncProcessor;
  let googleDriveService: GoogleDriveService;
  let slideRepository: Repository<Slide>;
  let assignmentRepository: Repository<Assignment>;
  let submissionRepository: Repository<AssignmentSubmission>;

  const mockGoogleDriveService = {
    uploadFileStream: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockCacheService = {
    scanAndInvalidate: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(0),
  };

  const mockSlideRepository = {
    update: jest.fn(),
  };

  const mockAssignmentRepository = {
    update: jest.fn(),
  };

  const mockSubmissionRepository = {
    update: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriveSyncProcessor,
        {
          provide: GoogleDriveService,
          useValue: mockGoogleDriveService,
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: getRepositoryToken(Slide),
          useValue: mockSlideRepository,
        },
        {
          provide: getRepositoryToken(Assignment),
          useValue: mockAssignmentRepository,
        },
        {
          provide: getRepositoryToken(AssignmentSubmission),
          useValue: mockSubmissionRepository,
        },
      ],
    }).compile();

    processor = module.get<DriveSyncProcessor>(DriveSyncProcessor);
    googleDriveService = module.get<GoogleDriveService>(GoogleDriveService);
    slideRepository = module.get<Repository<Slide>>(getRepositoryToken(Slide));
    assignmentRepository = module.get<Repository<Assignment>>(getRepositoryToken(Assignment));
    submissionRepository = module.get<Repository<AssignmentSubmission>>(
      getRepositoryToken(AssignmentSubmission),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process upload with fileBufferBase64 and update slide entity', async () => {
    mockGoogleDriveService.uploadFileStream.mockResolvedValue({
      id: 'drive-file-abc',
      name: 'Lecture1.pdf',
    });

    const job = {
      id: 'drive-job-1',
      data: {
        type: DriveJobType.UPLOAD_SLIDE_FILE,
        courseId: 'CS101',
        folderId: 'folder-123',
        fileName: 'Lecture1.pdf',
        mimeType: 'application/pdf',
        fileBufferBase64: Buffer.from('test pdf content').toString('base64'),
        slideId: 'slide-uuid-1',
      },
    } as unknown as Job<DriveJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.driveFileId).toBe('drive-file-abc');
    expect(mockGoogleDriveService.uploadFileStream).toHaveBeenCalledWith(
      'folder-123',
      'Lecture1.pdf',
      'application/pdf',
      expect.anything(),
    );
    expect(mockSlideRepository.update).toHaveBeenCalledWith('slide-uuid-1', {
      driveFileId: 'drive-file-abc',
      fileName: 'Lecture1.pdf',
    });
  });

  it('should process upload with assignmentId and update assignment entity', async () => {
    mockGoogleDriveService.uploadFileStream.mockResolvedValue({
      id: 'drive-assign-file',
      name: 'Project_Brief.pdf',
    });

    const job = {
      id: 'drive-job-assign',
      data: {
        type: DriveJobType.UPLOAD_ASSIGNMENT_FILE,
        courseId: 'CS101',
        folderId: 'folder-assign',
        fileName: 'Project_Brief.pdf',
        mimeType: 'application/pdf',
        fileBufferBase64: Buffer.from('brief content').toString('base64'),
        assignmentId: 'assign-uuid-1',
      },
    } as unknown as Job<DriveJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.driveFileId).toBe('drive-assign-file');
    expect(mockAssignmentRepository.update).toHaveBeenCalledWith('assign-uuid-1', {
      fileId: 'drive-assign-file',
      fileName: 'Project_Brief.pdf',
    });
  });

  it('should process upload with submissionId and update submission entity', async () => {
    mockGoogleDriveService.uploadFileStream.mockResolvedValue({
      id: 'drive-sub-file',
      name: 'Solution.zip',
    });

    const job = {
      id: 'drive-job-sub',
      data: {
        type: DriveJobType.UPLOAD_SUBMISSION_FILE,
        courseId: 'CS101',
        folderId: 'folder-sub',
        fileName: 'Solution.zip',
        mimeType: 'application/zip',
        fileBufferBase64: Buffer.from('zip binary').toString('base64'),
        submissionId: 'sub-uuid-1',
      },
    } as unknown as Job<DriveJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.driveFileId).toBe('drive-sub-file');
    expect(mockSubmissionRepository.update).toHaveBeenCalledWith('sub-uuid-1', {
      fileId: 'drive-sub-file',
      fileName: 'Solution.zip',
    });
  });

  it('should process upload with tempFilePath and asynchronously unlink temp file', async () => {
    mockGoogleDriveService.uploadFileStream.mockResolvedValue({
      id: 'drive-file-temp',
      name: 'Slides.pdf',
    });
    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('sample stream'));
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);

    const job = {
      id: 'drive-job-temp',
      data: {
        type: DriveJobType.UPLOAD_SLIDE_FILE,
        courseId: 'CS101',
        fileName: 'Slides.pdf',
        mimeType: 'application/pdf',
        tempFilePath: '/tmp/upload-12345.pdf',
      },
    } as unknown as Job<DriveJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(fs.readFile).toHaveBeenCalledWith('/tmp/upload-12345.pdf');
    expect(fs.unlink).toHaveBeenCalledWith('/tmp/upload-12345.pdf');
  });

  it('should handle temp file unlink error gracefully in finally block', async () => {
    mockGoogleDriveService.uploadFileStream.mockResolvedValue({
      id: 'drive-file-temp2',
      name: 'Slides.pdf',
    });
    (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('sample'));
    (fs.unlink as jest.Mock).mockRejectedValue(new Error('ENOENT: file already removed'));

    const job = {
      id: 'drive-job-unlink-err',
      data: {
        type: DriveJobType.UPLOAD_SLIDE_FILE,
        courseId: 'CS101',
        fileName: 'Slides.pdf',
        mimeType: 'application/pdf',
        tempFilePath: '/tmp/deleted.pdf',
      },
    } as unknown as Job<DriveJobData>;

    const result = await processor.process(job);
    expect(result.success).toBe(true);
  });

  it('should throw an error when neither buffer nor tempFilePath is provided', async () => {
    const job = {
      id: 'drive-job-missing',
      data: {
        type: DriveJobType.UPLOAD_SLIDE_FILE,
        courseId: 'CS101',
        fileName: 'Empty.pdf',
        mimeType: 'application/pdf',
      },
    } as unknown as Job<DriveJobData>;

    await expect(processor.process(job)).rejects.toThrow(
      'Either fileBufferBase64 or tempFilePath must be provided for upload',
    );
  });

  it('should process DELETE_DRIVE_FILE and call GoogleDriveService', async () => {
    mockGoogleDriveService.deleteFile.mockResolvedValue(undefined);

    const job = {
      id: 'drive-del-1',
      data: {
        type: DriveJobType.DELETE_DRIVE_FILE,
        driveFileId: 'drive-del-abc',
      },
    } as unknown as Job<DriveJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.driveFileId).toBe('drive-del-abc');
    expect(mockGoogleDriveService.deleteFile).toHaveBeenCalledWith('drive-del-abc');
  });

  it('should throw an error when deleteFile fails', async () => {
    mockGoogleDriveService.deleteFile.mockRejectedValueOnce(new Error('Drive delete failed'));

    const job = {
      id: 'drive-del-err',
      data: {
        type: DriveJobType.DELETE_DRIVE_FILE,
        driveFileId: 'drive-fail-id',
      },
    } as unknown as Job<DriveJobData>;

    await expect(processor.process(job)).rejects.toThrow('Drive delete failed');
  });

  it('should throw an error on unsupported drive job type', async () => {
    const job = {
      id: 'drive-unsupp',
      data: {
        type: 'UNSUPPORTED_DRIVE_ACTION' as any,
      },
    } as unknown as Job<DriveJobData>;

    await expect(processor.process(job)).rejects.toThrow('Unsupported drive job type: UNSUPPORTED_DRIVE_ACTION');
  });
});

