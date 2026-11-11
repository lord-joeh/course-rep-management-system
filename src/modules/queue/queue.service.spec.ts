import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueService } from './queue.service';
import {
  QueueName,
  EmailJobType,
  DriveJobType,
  AttendanceJobType,
  EnrollmentJobType,
} from './constants';

describe('QueueService', () => {
  let service: QueueService;

  const mockEmailQueue = {
    add: jest.fn().mockResolvedValue({ id: 'email-job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 1, completed: 10, failed: 0 }),
  };

  const mockSmsQueue = {
    add: jest.fn().mockResolvedValue({ id: 'sms-job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 5, failed: 0 }),
  };

  const mockDriveSyncQueue = {
    add: jest.fn().mockResolvedValue({ id: 'drive-job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 0, completed: 8, failed: 1 }),
  };

  const mockAttendanceQueue = {
    add: jest.fn().mockResolvedValue({ id: 'attendance-job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 3, failed: 0 }),
  };

  const mockEnrollmentQueue = {
    add: jest.fn().mockResolvedValue({ id: 'enrollment-job-1' }),
    getJobCounts: jest.fn().mockResolvedValue({ waiting: 1, active: 0, completed: 4, failed: 0 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken(QueueName.EMAIL),
          useValue: mockEmailQueue,
        },
        {
          provide: getQueueToken(QueueName.SMS),
          useValue: mockSmsQueue,
        },
        {
          provide: getQueueToken(QueueName.DRIVE_SYNC),
          useValue: mockDriveSyncQueue,
        },
        {
          provide: getQueueToken(QueueName.ATTENDANCE),
          useValue: mockAttendanceQueue,
        },
        {
          provide: getQueueToken(QueueName.ENROLLMENT),
          useValue: mockEnrollmentQueue,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should enqueue email job with default and custom options', async () => {
    const jobId = await service.sendEmail(
      EmailJobType.REGISTRATION_SUCCESS,
      {
        to: 'new@student.edu',
        name: 'New Student',
        studentId: 'STD-001',
      },
      { attempts: 5 },
    );

    expect(jobId).toBe('email-job-1');
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      EmailJobType.REGISTRATION_SUCCESS,
      expect.objectContaining({
        jobType: EmailJobType.REGISTRATION_SUCCESS,
        to: 'new@student.edu',
      }),
      expect.objectContaining({
        attempts: 5,
      }),
    );
  });

  it('should enqueue sms job', async () => {
    const jobId = await service.sendSms('0240001122', 'Lecture canceled', undefined, {
      userId: 'rep-1',
    });

    expect(jobId).toBe('sms-job-1');
    expect(mockSmsQueue.add).toHaveBeenCalledWith(
      'send-sms',
      expect.objectContaining({
        to: '0240001122',
        message: 'Lecture canceled',
        userId: 'rep-1',
      }),
      expect.objectContaining({
        attempts: 3,
      }),
    );
  });

  it('should enqueue drive upload job', async () => {
    const jobId = await service.uploadToDrive({
      courseId: 'CS101',
      folderId: 'folder-abc',
      fileName: 'Week1.pdf',
      mimeType: 'application/pdf',
      fileBufferBase64: 'base64string',
    });

    expect(jobId).toBe('drive-job-1');
    expect(mockDriveSyncQueue.add).toHaveBeenCalledWith(
      'upload-drive-file',
      expect.objectContaining({
        type: DriveJobType.UPLOAD_SLIDE_FILE,
        courseId: 'CS101',
        fileName: 'Week1.pdf',
      }),
      expect.objectContaining({
        attempts: 5,
      }),
    );
  });

  it('should enqueue drive delete job', async () => {
    const jobId = await service.deleteFromDrive('drive-file-to-delete', undefined, {
      slideId: 'slide-uuid',
    });

    expect(jobId).toBe('drive-job-1');
    expect(mockDriveSyncQueue.add).toHaveBeenCalledWith(
      'delete-drive-file',
      expect.objectContaining({
        type: DriveJobType.DELETE_DRIVE_FILE,
        driveFileId: 'drive-file-to-delete',
        slideId: 'slide-uuid',
      }),
      expect.objectContaining({
        attempts: 5,
      }),
    );
  });

  it('should enqueue attendance roster initialization job', async () => {
    const jobId = await service.initializeAttendanceRoster(
      'session-uuid-1',
      'CS101',
      '2026-11-03T09:00:00Z',
    );

    expect(jobId).toBe('attendance-job-1');
    expect(mockAttendanceQueue.add).toHaveBeenCalledWith(
      'initialize-roster',
      expect.objectContaining({
        type: AttendanceJobType.INITIALIZE_ROSTER,
        sessionId: 'session-uuid-1',
        courseId: 'CS101',
      }),
      expect.objectContaining({
        attempts: 3,
      }),
    );
  });

  it('should enqueue student auto-enrollment into all courses', async () => {
    const jobId = await service.enrollStudentInAllCourses('STD-001');

    expect(jobId).toBe('enrollment-job-1');
    expect(mockEnrollmentQueue.add).toHaveBeenCalledWith(
      EnrollmentJobType.ENROLL_STUDENT_ALL_COURSES,
      expect.objectContaining({
        type: EnrollmentJobType.ENROLL_STUDENT_ALL_COURSES,
        studentId: 'STD-001',
      }),
      expect.objectContaining({
        attempts: 3,
      }),
    );
  });

  it('should enqueue course auto-enrollment for all active students', async () => {
    const jobId = await service.enrollAllStudentsInCourse('COURSE-101');

    expect(jobId).toBe('enrollment-job-1');
    expect(mockEnrollmentQueue.add).toHaveBeenCalledWith(
      EnrollmentJobType.ENROLL_ALL_STUDENTS_COURSE,
      expect.objectContaining({
        type: EnrollmentJobType.ENROLL_ALL_STUDENTS_COURSE,
        courseId: 'COURSE-101',
      }),
      expect.objectContaining({
        attempts: 3,
      }),
    );
  });

  it('should retrieve queue operational statistics', async () => {
    const stats = await service.getQueueStats();

    expect(stats[QueueName.EMAIL]).toEqual({ waiting: 0, active: 1, completed: 10, failed: 0 });
    expect(stats[QueueName.SMS]).toEqual({ waiting: 0, active: 0, completed: 5, failed: 0 });
    expect(stats[QueueName.DRIVE_SYNC]).toEqual({ waiting: 2, active: 0, completed: 8, failed: 1 });
    expect(stats[QueueName.ATTENDANCE]).toEqual({ waiting: 0, active: 0, completed: 3, failed: 0 });
    expect(stats[QueueName.ENROLLMENT]).toEqual({ waiting: 1, active: 0, completed: 4, failed: 0 });
  });
});

