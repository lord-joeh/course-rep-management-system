import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AssignmentService } from './assignment.service';
import { Assignment } from './entities/assignment.entity';
import { AssignmentSubmission } from './entities/assignment-submission.entity';
import { Course } from '../course/entities/course.entity';
import { Student } from '../student/entities/student.entity';
import { GoogleDriveService } from '../google/services/google-drive.service';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import { DriveJobType } from '../queue/constants';
import { UserRole } from '../../common/decorators/roles.decorator';
import { Readable } from 'stream';

describe('AssignmentService', () => {
  let service: AssignmentService;
  let assignmentRepoMock: any;
  let submissionRepoMock: any;
  let courseRepoMock: any;
  let studentRepoMock: any;
  let googleDriveServiceMock: any;
  let cacheServiceMock: any;
  let queueServiceMock: any;
  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    assignmentRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve({ id: 'ass-uuid-1', ...entity })),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    submissionRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve({ id: 'sub-uuid-1', ...entity })),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    courseRepoMock = {
      findOne: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    studentRepoMock = {
      findOne: jest.fn(),
    };

    googleDriveServiceMock = {
      createFolder: jest.fn().mockResolvedValue({ id: 'drive-folder-123', name: 'Folder' }),
      uploadFileStream: jest.fn().mockResolvedValue({ id: 'drive-file-123', name: 'uploaded.pdf' }),
      downloadFileStream: jest.fn().mockResolvedValue({
        stream: Readable.from(['test content']),
        fileName: 'file.pdf',
        mimeType: 'application/pdf',
      }),
      deleteFile: jest.fn().mockResolvedValue({ message: 'Deleted', fileId: '123' }),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(true),
      scanAndInvalidate: jest.fn().mockResolvedValue(1),
    };

    queueServiceMock = {
      uploadToDrive: jest.fn().mockResolvedValue('job-drive-upload-1'),
      deleteFromDrive: jest.fn().mockResolvedValue('job-drive-delete-1'),
      sendEmail: jest.fn().mockResolvedValue('job-email-1'),
      sendSms: jest.fn().mockResolvedValue('job-sms-1'),
      initializeAttendanceRoster: jest.fn().mockResolvedValue('job-roster-1'),
      getQueueStats: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentService,
        {
          provide: getRepositoryToken(Assignment),
          useValue: assignmentRepoMock,
        },
        {
          provide: getRepositoryToken(AssignmentSubmission),
          useValue: submissionRepoMock,
        },
        {
          provide: getRepositoryToken(Course),
          useValue: courseRepoMock,
        },
        {
          provide: getRepositoryToken(Student),
          useValue: studentRepoMock,
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
            dispatchAssignmentCreated: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<AssignmentService>(AssignmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAssignment', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    it('should throw NotFoundException if course does not exist', async () => {
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.createAssignment({
          title: 'Project 1',
          description: 'Build an API',
          courseId: 'CS101',
          deadline: futureDate,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid or past deadline', async () => {
      courseRepoMock.findOne.mockResolvedValue({ id: 'CS101', name: 'Computer Science' });

      await expect(
        service.createAssignment({
          title: 'Project 1',
          description: 'Build an API',
          courseId: 'CS101',
          deadline: 'invalid-date',
        }),
      ).rejects.toThrow(BadRequestException);

      const pastDate = new Date(Date.now() - 100000).toISOString();
      await expect(
        service.createAssignment({
          title: 'Project 1',
          description: 'Build an API',
          courseId: 'CS101',
          deadline: pastDate,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully create an assignment nested under existing course slidesFolderId', async () => {
      courseRepoMock.findOne.mockResolvedValue({
        id: 'CS101',
        name: 'CS 101',
        slidesFolderId: 'folder-slides-101',
      });

      const result = await service.createAssignment({
        title: 'Project 1',
        description: 'Build an API',
        courseId: 'CS101',
        deadline: futureDate,
      });

      expect(googleDriveServiceMock.createFolder).toHaveBeenCalledWith(
        'CS 101 Project 1 Submissions',
        'folder-slides-101',
      );
      expect(googleDriveServiceMock.uploadFileStream).not.toHaveBeenCalled();
      expect(assignmentRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:assignments:course:CS101:*');
      expect(result.id).toBe('ass-uuid-1');
      expect(result.fileId).toBeNull();
    });

    it('should auto-provision course materials folder if slidesFolderId is missing', async () => {
      courseRepoMock.findOne.mockResolvedValue({
        id: 'CS101',
        name: 'CS 101',
        slidesFolderId: null,
      });

      googleDriveServiceMock.createFolder
        .mockResolvedValueOnce({ id: 'new-course-folder-id', name: 'CS 101 Materials' })
        .mockResolvedValueOnce({ id: 'new-submissions-folder-id', name: 'CS 101 Project 1 Submissions' });

      await service.createAssignment({
        title: 'Project 1',
        description: 'Build an API',
        courseId: 'CS101',
        deadline: futureDate,
      });

      expect(googleDriveServiceMock.createFolder).toHaveBeenNthCalledWith(1, 'CS 101 Materials');
      expect(courseRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ slidesFolderId: 'new-course-folder-id' }),
      );
      expect(googleDriveServiceMock.createFolder).toHaveBeenNthCalledWith(
        2,
        'CS 101 Project 1 Submissions',
        'new-course-folder-id',
      );
    });

    it('should fallback to courseId for folder name if course.name is empty', async () => {
      courseRepoMock.findOne.mockResolvedValue({
        id: 'CS101',
        name: '',
        slidesFolderId: 'folder-slides-101',
      });

      await service.createAssignment({
        title: 'Project 1',
        description: 'Build an API',
        courseId: 'CS101',
        deadline: futureDate,
      });

      expect(googleDriveServiceMock.createFolder).toHaveBeenCalledWith(
        'CS101 Project 1 Submissions',
        'folder-slides-101',
      );
    });

    it('should successfully create an assignment with attached spec file', async () => {
      courseRepoMock.findOne.mockResolvedValue({
        id: 'CS101',
        name: 'CS 101',
        slidesFolderId: 'folder-slides-101',
      });

      const fileMock: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'ProjectBrief.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        buffer: Buffer.from('spec document'),
        size: 13,
        stream: null as any,
        destination: '',
        filename: '',
        path: '',
      };

      const result = await service.createAssignment(
        {
          title: 'Project 1',
          description: 'Build an API',
          courseId: 'CS101',
          deadline: futureDate,
        },
        fileMock,
      );

      expect(queueServiceMock.uploadToDrive).toHaveBeenCalledWith({
        type: DriveJobType.UPLOAD_ASSIGNMENT_FILE,
        courseId: 'CS101',
        folderId: 'drive-folder-123',
        fileName: 'ProjectBrief.pdf',
        mimeType: 'application/pdf',
        fileBufferBase64: fileMock.buffer.toString('base64'),
        assignmentId: 'ass-uuid-1',
      });
      expect(result.fileId).toBe('pending');
      expect(result.fileName).toBe('ProjectBrief.pdf');
    });
  });

  describe('updateAssignment', () => {
    it('should throw NotFoundException if assignment does not exist', async () => {
      assignmentRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateAssignment('ass-999', { title: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if updating with invalid or past deadline', async () => {
      assignmentRepoMock.findOne.mockResolvedValue({
        id: 'ass-1',
        courseId: 'CS101',
        deadline: new Date(Date.now() + 86400000),
      });

      await expect(
        service.updateAssignment('ass-1', { deadline: 'invalid-date' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateAssignment('ass-1', {
          deadline: new Date(Date.now() - 50000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully update assignment title, description, and future deadline', async () => {
      const existing = {
        id: 'ass-1',
        title: 'Old Title',
        description: 'Old Desc',
        courseId: 'CS101',
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(existing);

      const futureDate = new Date(Date.now() + 172800000).toISOString();
      const result = await service.updateAssignment('ass-1', {
        title: 'New Title',
        description: 'New Desc',
        deadline: futureDate,
      });

      expect(assignmentRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:assignments:course:CS101:*');
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:assignment:ass-1');
      expect(result.title).toBe('New Title');
    });

    it('should update partial fields without error when only title or description is passed', async () => {
      const existing = {
        id: 'ass-1',
        title: 'Old Title',
        description: 'Old Desc',
        courseId: 'CS101',
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(existing);

      await service.updateAssignment('ass-1', { title: 'New Title Only' });
      expect(assignmentRepoMock.save).toHaveBeenCalled();

      await service.updateAssignment('ass-1', { description: 'New Desc Only' });
      expect(assignmentRepoMock.save).toHaveBeenCalled();
    });
  });

  describe('submitAssignment', () => {
    const fileMock: Express.Multer.File = {
      fieldname: 'file',
      originalname: 'StudentWork.zip',
      encoding: '7bit',
      mimetype: 'application/zip',
      buffer: Buffer.from('student work'),
      size: 12,
      stream: null as any,
      destination: '',
      filename: '',
      path: '',
    };

    it('should throw BadRequestException if file is missing', async () => {
      await expect(
        service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if assignment does not exist', async () => {
      assignmentRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if deadline has passed', async () => {
      assignmentRepoMock.findOne.mockResolvedValue({
        id: 'ass-1',
        deadline: new Date(Date.now() - 10000),
      });

      await expect(
        service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if student does not exist', async () => {
      assignmentRepoMock.findOne.mockResolvedValue({
        id: 'ass-1',
        deadline: new Date(Date.now() + 86400000),
      });
      studentRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock),
      ).rejects.toThrow(NotFoundException);
    });

    it('should auto-create folder if assignment has no submissionFolderId', async () => {
      const assignment = {
        id: 'ass-1',
        title: 'Project 1',
        courseId: 'CS101',
        course: { name: 'CS 101', slidesFolderId: 'folder-slides-101' },
        submissionFolderId: null,
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      submissionRepoMock.findOne.mockResolvedValue(null);

      await service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock);

      expect(googleDriveServiceMock.createFolder).toHaveBeenCalledWith(
        'CS 101 Project 1 Submissions',
        'folder-slides-101',
      );
      expect(assignmentRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ submissionFolderId: 'drive-folder-123' }),
      );
    });

    it('should fallback to courseId if course relation has no name when creating folder', async () => {
      const assignment = {
        id: 'ass-1',
        title: 'Project 1',
        courseId: 'CS101',
        course: null,
        submissionFolderId: null,
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      courseRepoMock.findOne.mockResolvedValue({
        id: 'CS101',
        name: '',
        slidesFolderId: 'folder-slides-101',
      });
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      submissionRepoMock.findOne.mockResolvedValue(null);

      await service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock);

      expect(googleDriveServiceMock.createFolder).toHaveBeenCalledWith(
        'CS101 Project 1 Submissions',
        'folder-slides-101',
      );
    });

    it('should clean up prior submission file on resubmission', async () => {
      const assignment = {
        id: 'ass-1',
        title: 'Project 1',
        courseId: 'CS101',
        submissionFolderId: 'folder-abc',
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });

      const priorSubmission = {
        id: 'prior-sub-1',
        assignmentId: 'ass-1',
        studentId: 'student-1',
        fileId: 'old-file-999',
        fileName: 'old.zip',
      };
      submissionRepoMock.findOne.mockResolvedValue(priorSubmission);

      const result = await service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock);

      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('old-file-999');
      expect(submissionRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'prior-sub-1', fileId: 'pending', fileName: 'StudentWork.zip' }),
      );
      expect(queueServiceMock.uploadToDrive).toHaveBeenCalledWith({
        type: DriveJobType.UPLOAD_SUBMISSION_FILE,
        courseId: 'CS101',
        folderId: 'folder-abc',
        fileName: 'StudentWork.zip',
        mimeType: 'application/zip',
        fileBufferBase64: fileMock.buffer.toString('base64'),
        submissionId: 'prior-sub-1',
      });
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:assignments:student:student-1:*');
    });

    it('should not call deleteFile if prior submission has null fileId', async () => {
      const assignment = {
        id: 'ass-1',
        title: 'Project 1',
        courseId: 'CS101',
        submissionFolderId: 'folder-abc',
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });

      const priorSubmission = {
        id: 'prior-sub-1',
        assignmentId: 'ass-1',
        studentId: 'student-1',
        fileId: null,
      };
      submissionRepoMock.findOne.mockResolvedValue(priorSubmission);

      await service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock);

      expect(queueServiceMock.deleteFromDrive).not.toHaveBeenCalled();
    });

    it('should catch error gracefully if old file deletion fails on resubmission', async () => {
      const assignment = {
        id: 'ass-1',
        title: 'Project 1',
        courseId: 'CS101',
        submissionFolderId: 'folder-abc',
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });

      const priorSubmission = {
        id: 'prior-sub-1',
        assignmentId: 'ass-1',
        studentId: 'student-1',
        fileId: 'bad-file',
      };
      submissionRepoMock.findOne.mockResolvedValue(priorSubmission);
      queueServiceMock.deleteFromDrive.mockRejectedValueOnce(new Error('Queue unreachable'));

      await expect(
        service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock),
      ).resolves.toBeDefined();
    });

    it('should successfully create brand new submission when none exists', async () => {
      const assignment = {
        id: 'ass-1',
        title: 'Project 1',
        courseId: 'CS101',
        submissionFolderId: 'folder-abc',
        deadline: new Date(Date.now() + 86400000),
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      submissionRepoMock.findOne.mockResolvedValue(null);

      const result = await service.submitAssignment({ assignmentId: 'ass-1' }, 'student-1', fileMock);

      expect(submissionRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          assignmentId: 'ass-1',
          studentId: 'student-1',
          fileId: 'pending',
          fileName: 'StudentWork.zip',
        }),
      );
      expect(queueServiceMock.uploadToDrive).toHaveBeenCalledWith({
        type: DriveJobType.UPLOAD_SUBMISSION_FILE,
        courseId: 'CS101',
        folderId: 'folder-abc',
        fileName: 'StudentWork.zip',
        mimeType: 'application/zip',
        fileBufferBase64: fileMock.buffer.toString('base64'),
        submissionId: 'sub-uuid-1',
      });
      expect(result.id).toBe('sub-uuid-1');
    });
  });

  describe('getAssignmentsByCourse', () => {
    it('should return cached result if available', async () => {
      const cached = { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false } };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.getAssignmentsByCourse(
        { courseId: 'CS101', page: 1, limit: 20 },
        { id: 'student-1', role: UserRole.STUDENT },
      );

      expect(result).toBe(cached);
      expect(assignmentRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should default page to 1 and limit to 20 when not provided in query', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getAssignmentsByCourse(
        { courseId: 'CS101' } as any,
        { role: UserRole.STUDENT },
      );

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should query assignments and decorate with student submission status', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const assignment = { id: 'ass-1', title: 'A1', description: 'D1' };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[assignment], 1]);
      submissionRepoMock.findOne.mockResolvedValue({
        id: 'sub-1',
        submittedAt: new Date(),
        fileName: 'solution.zip',
      });
      submissionRepoMock.count.mockResolvedValue(15);

      const result = await service.getAssignmentsByCourse(
        { courseId: 'CS101', page: 1, limit: 10, search: 'A1' },
        { sub: 'student-1', role: UserRole.STUDENT },
      );

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(assignment.title ILIKE :search OR assignment.description ILIKE :search)',
        { search: '%A1%' },
      );
      expect(result.items[0].hasSubmitted).toBe(true);
      expect(result.items[0].submissionCount).toBe(15);
      expect(result.meta.total).toBe(1);
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });

    it('should handle student with no submission correctly (null studentSubmission)', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const assignment = { id: 'ass-1', title: 'A1' };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[assignment], 1]);
      submissionRepoMock.findOne.mockResolvedValue(null);
      submissionRepoMock.count.mockResolvedValue(0);

      const result = await service.getAssignmentsByCourse(
        { courseId: 'CS101', page: 1, limit: 10 },
        { id: 'student-1', role: UserRole.STUDENT },
      );

      expect(result.items[0].hasSubmitted).toBe(false);
      expect(result.items[0].studentSubmission).toBeNull();
    });

    it('should query assignments for Rep without individual submission check', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const assignment = { id: 'ass-1', title: 'A1' };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[assignment], 1]);
      submissionRepoMock.count.mockResolvedValue(5);

      const result = await service.getAssignmentsByCourse(
        { courseId: 'CS101', page: 1, limit: 10 },
        { id: 'rep-1', role: UserRole.REP },
      );

      expect(submissionRepoMock.findOne).not.toHaveBeenCalled();
      expect(result.items[0].hasSubmitted).toBe(false);
      expect(result.items[0].submissionCount).toBe(5);
    });
  });

  describe('getAssignmentById', () => {
    it('should throw NotFoundException if assignment does not exist', async () => {
      assignmentRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.getAssignmentById('ass-999', { id: 'u1', role: UserRole.REP }, { page: 1, limit: 10 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should default page to 1 and limit to 20 for Rep query when omitted', async () => {
      const assignment = { id: 'ass-1', title: 'A1' };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      submissionRepoMock.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getAssignmentById(
        'ass-1',
        { id: 'rep-1', role: UserRole.REP },
        {} as any,
      );

      expect(result.submissions.meta.page).toBe(1);
      expect(result.submissions.meta.limit).toBe(20);
    });

    it('should return assignment and paginated student submissions for Course Rep', async () => {
      const assignment = { id: 'ass-1', title: 'A1' };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);

      const submissions = [
        {
          id: 'sub-1',
          studentId: 'st-1',
          student: { name: 'John', email: 'john@uni.edu' },
          fileId: 'f-1',
          fileName: 'j.zip',
          submittedAt: new Date(),
        },
        {
          id: 'sub-2',
          studentId: 'st-2',
          student: null, // Test null student branch
          fileId: 'f-2',
          fileName: 'j2.zip',
          submittedAt: new Date(),
        },
      ];
      submissionRepoMock.findAndCount.mockResolvedValue([submissions, 2]);

      const result = await service.getAssignmentById(
        'ass-1',
        { id: 'rep-1', role: UserRole.REP },
        { page: 1, limit: 10 },
      );

      expect(result.assignment).toBe(assignment);
      expect(result.submissions.items).toHaveLength(2);
      expect(result.submissions.items[0].studentName).toBe('John');
      expect(result.submissions.items[1].studentName).toBeUndefined();
      expect(result.submissions.meta.total).toBe(2);
    });

    it('should return assignment and single submission for Student', async () => {
      const assignment = { id: 'ass-1', title: 'A1' };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);

      const submission = { id: 'sub-1', studentId: 'st-1', fileName: 'my.zip' };
      submissionRepoMock.findOne.mockResolvedValue(submission);

      const result = await service.getAssignmentById(
        'ass-1',
        { sub: 'st-1', role: UserRole.STUDENT },
        { page: 1, limit: 10 },
      );

      expect(result.assignment).toBe(assignment);
      expect(result.submission).toBe(submission);
    });

    it('should return null submission for Student if not yet submitted', async () => {
      const assignment = { id: 'ass-1', title: 'A1' };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      submissionRepoMock.findOne.mockResolvedValue(null);

      const result = await service.getAssignmentById(
        'ass-1',
        { id: 'st-1', role: UserRole.STUDENT },
        { page: 1, limit: 10 },
      );

      expect(result.submission).toBeNull();
    });
  });

  describe('getStudentSubmissions', () => {
    it('should throw ForbiddenException if student tries to view another student submissions', async () => {
      await expect(
        service.getStudentSubmissions(
          'target-student',
          { id: 'other-student', role: UserRole.STUDENT },
          { page: 1, limit: 10 },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should default page to 1 and limit to 20 when omitted', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getStudentSubmissions(
        'student-1',
        { sub: 'student-1', role: UserRole.STUDENT },
        {} as any,
      );

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('should return cached result if present', async () => {
      const cached = { items: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false } };
      cacheServiceMock.get.mockResolvedValue(cached);

      const result = await service.getStudentSubmissions(
        'student-1',
        { id: 'student-1', role: UserRole.STUDENT },
        { page: 1, limit: 20 },
      );

      expect(result).toBe(cached);
    });

    it('should query submissions with assignment filter', async () => {
      cacheServiceMock.get.mockResolvedValue(null);
      const sub = { id: 'sub-1', studentId: 'student-1' };
      queryBuilderMock.getManyAndCount.mockResolvedValue([[sub], 1]);

      const result = await service.getStudentSubmissions(
        'student-1',
        { id: 'rep-1', role: UserRole.REP },
        { assignmentId: 'ass-1', page: 1, limit: 10 },
      );

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'submission.assignmentId = :assignmentId',
        { assignmentId: 'ass-1' },
      );
      expect(result.items).toHaveLength(1);
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });
  });

  describe('deleteAssignment', () => {
    it('should throw NotFoundException if assignment does not exist', async () => {
      assignmentRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteAssignment('ass-999')).rejects.toThrow(NotFoundException);
    });

    it('should cascade delete submission files, Drive folder, and spec file', async () => {
      const assignment = {
        id: 'ass-1',
        submissionFolderId: 'folder-123',
        fileId: 'spec-file-123',
        submissions: [
          { id: 'sub-1', fileId: 'f1' },
          { id: 'sub-2', fileId: 'f2' },
          { id: 'sub-3', fileId: null },
        ],
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);

      const result = await service.deleteAssignment('ass-1');

      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('f1');
      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('f2');
      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('folder-123');
      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('spec-file-123');
      expect(assignmentRepoMock.remove).toHaveBeenCalledWith(assignment);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:assignments:*');
      expect(result.message).toContain('successfully deleted');
    });

    it('should handle deletion when submissions, folderId, and fileId are empty/null', async () => {
      const assignment = {
        id: 'ass-1',
        submissionFolderId: null,
        fileId: null,
        submissions: null,
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);

      await service.deleteAssignment('ass-1');

      expect(queueServiceMock.deleteFromDrive).not.toHaveBeenCalled();
      expect(assignmentRepoMock.remove).toHaveBeenCalledWith(assignment);
    });

    it('should catch errors when folder or spec file deletion fails', async () => {
      const assignment = {
        id: 'ass-1',
        submissionFolderId: 'folder-123',
        fileId: 'spec-123',
        submissions: [],
      };
      assignmentRepoMock.findOne.mockResolvedValue(assignment);
      queueServiceMock.deleteFromDrive.mockRejectedValue(new Error('Queue error'));

      await expect(service.deleteAssignment('ass-1')).resolves.toBeDefined();
    });
  });

  describe('deleteSubmission', () => {
    it('should throw NotFoundException if submission does not exist', async () => {
      submissionRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.deleteSubmission('sub-999', { id: 'u1', role: UserRole.STUDENT }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if student tries to delete another student submission', async () => {
      submissionRepoMock.findOne.mockResolvedValue({
        id: 'sub-1',
        studentId: 'owner-student',
      });

      await expect(
        service.deleteSubmission('sub-1', { id: 'malicious-student', role: UserRole.STUDENT }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if student tries to delete submission after deadline', async () => {
      submissionRepoMock.findOne.mockResolvedValue({
        id: 'sub-1',
        studentId: 'student-1',
        assignment: { deadline: new Date(Date.now() - 100000) },
      });

      await expect(
        service.deleteSubmission('sub-1', { id: 'student-1', role: UserRole.STUDENT }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow student to delete submission before deadline', async () => {
      const submission = {
        id: 'sub-1',
        studentId: 'student-1',
        fileId: 'f-1',
        assignmentId: 'ass-1',
        assignment: { courseId: 'CS101', deadline: new Date(Date.now() + 86400000) },
      };
      submissionRepoMock.findOne.mockResolvedValue(submission);

      const result = await service.deleteSubmission('sub-1', { id: 'student-1', role: UserRole.STUDENT });

      expect(queueServiceMock.deleteFromDrive).toHaveBeenCalledWith('f-1');
      expect(submissionRepoMock.remove).toHaveBeenCalledWith(submission);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith('cr:assignments:student:student-1:*');
      expect(result.message).toContain('successfully deleted');
    });

    it('should allow Course Rep to delete submission even after deadline', async () => {
      const submission = {
        id: 'sub-1',
        studentId: 'student-1',
        fileId: null, // Test branch where fileId is null
        assignmentId: 'ass-1',
        assignment: null, // Test branch where assignment relation is null
      };
      submissionRepoMock.findOne.mockResolvedValue(submission);

      const result = await service.deleteSubmission('sub-1', { id: 'rep-1', role: UserRole.REP });

      expect(queueServiceMock.deleteFromDrive).not.toHaveBeenCalled();
      expect(submissionRepoMock.remove).toHaveBeenCalled();
      expect(result.message).toContain('successfully deleted');
    });

    it('should catch error if drive file deletion fails', async () => {
      const submission = {
        id: 'sub-1',
        studentId: 'student-1',
        fileId: 'bad-drive-id',
        assignmentId: 'ass-1',
        assignment: { courseId: 'CS101', deadline: new Date(Date.now() + 86400000) },
      };
      submissionRepoMock.findOne.mockResolvedValue(submission);
      queueServiceMock.deleteFromDrive.mockRejectedValueOnce(new Error('Network drop'));

      await expect(
        service.deleteSubmission('sub-1', { id: 'student-1', role: UserRole.STUDENT }),
      ).resolves.toBeDefined();
    });
  });

  describe('downloadAssignmentFile', () => {
    it('should throw NotFoundException if assignment does not exist or has no fileId', async () => {
      assignmentRepoMock.findOne.mockResolvedValue(null);
      await expect(service.downloadAssignmentFile('ass-1')).rejects.toThrow(NotFoundException);

      assignmentRepoMock.findOne.mockResolvedValue({ id: 'ass-1', fileId: null });
      await expect(service.downloadAssignmentFile('ass-1')).rejects.toThrow(NotFoundException);
    });

    it('should return download stream for valid assignment spec file', async () => {
      assignmentRepoMock.findOne.mockResolvedValue({ id: 'ass-1', fileId: 'spec-123' });

      const result = await service.downloadAssignmentFile('ass-1');

      expect(googleDriveServiceMock.downloadFileStream).toHaveBeenCalledWith('spec-123');
      expect(result.fileName).toBe('file.pdf');
    });
  });

  describe('downloadSubmissionFile', () => {
    it('should throw NotFoundException if submission does not exist or has no fileId', async () => {
      submissionRepoMock.findOne.mockResolvedValue(null);
      await expect(
        service.downloadSubmissionFile('sub-1', { id: 'u1', role: UserRole.REP }),
      ).rejects.toThrow(NotFoundException);

      submissionRepoMock.findOne.mockResolvedValue({ id: 'sub-1', fileId: null });
      await expect(
        service.downloadSubmissionFile('sub-1', { id: 'u1', role: UserRole.REP }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if student tries to download another student file', async () => {
      submissionRepoMock.findOne.mockResolvedValue({
        id: 'sub-1',
        studentId: 'owner-student',
        fileId: 'f-123',
      });

      await expect(
        service.downloadSubmissionFile('sub-1', { id: 'other-student', role: UserRole.STUDENT }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow owning student or Rep to download submission file', async () => {
      submissionRepoMock.findOne.mockResolvedValue({
        id: 'sub-1',
        studentId: 'student-1',
        fileId: 'sub-f-123',
      });

      const studentResult = await service.downloadSubmissionFile('sub-1', {
        sub: 'student-1',
        role: UserRole.STUDENT,
      });
      expect(studentResult.fileName).toBe('file.pdf');

      const repResult = await service.downloadSubmissionFile('sub-1', {
        id: 'rep-1',
        role: UserRole.REP,
      });
      expect(repResult.fileName).toBe('file.pdf');
    });
  });
});
