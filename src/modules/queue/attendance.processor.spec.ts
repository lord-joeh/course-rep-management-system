import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { AttendanceProcessor } from './processors/attendance.processor';
import { Attendance, AttendanceStatus } from '../attendance/entities/attendance.entity';
import { CourseStudent } from '../course/entities/course-student.entity';
import { StudentStatus } from '../student/entities/student.entity';
import { AttendanceJobType } from './constants';
import { AttendanceJobData } from './dto';

describe('AttendanceProcessor', () => {
  let processor: AttendanceProcessor;
  let attendanceRepo: Repository<Attendance>;
  let courseStudentRepo: Repository<CourseStudent>;

  const mockAttendanceRepo = {
    find: jest.fn(),
    create: jest.fn((dto) => dto),
    save: jest.fn((records) => Promise.resolve(records)),
  };

  const mockCourseStudentRepo = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceProcessor,
        {
          provide: getRepositoryToken(Attendance),
          useValue: mockAttendanceRepo,
        },
        {
          provide: getRepositoryToken(CourseStudent),
          useValue: mockCourseStudentRepo,
        },
      ],
    }).compile();

    processor = module.get<AttendanceProcessor>(AttendanceProcessor);
    attendanceRepo = module.get<Repository<Attendance>>(getRepositoryToken(Attendance));
    courseStudentRepo = module.get<Repository<CourseStudent>>(getRepositoryToken(CourseStudent));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should initialize attendance roster for active students not yet registered', async () => {
    mockCourseStudentRepo.find.mockResolvedValue([
      {
        courseId: 'CS101',
        studentId: 'STD-1',
        student: { id: 'STD-1', status: StudentStatus.ACTIVE },
      },
      {
        courseId: 'CS101',
        studentId: 'STD-2',
        student: { id: 'STD-2', status: StudentStatus.ACTIVE },
      },
      {
        courseId: 'CS101',
        studentId: 'STD-3',
        student: { id: 'STD-3', status: StudentStatus.SUSPENDED }, // should be ignored
      },
    ]);

    // STD-1 already has a record, so only STD-2 should be created
    mockAttendanceRepo.find.mockResolvedValue([{ studentId: 'STD-1' }]);

    const job = {
      id: 'att-job-1',
      data: {
        type: AttendanceJobType.INITIALIZE_ROSTER,
        sessionId: 'sess-uuid-1',
        courseId: 'CS101',
        date: '2026-11-03T09:00:00Z',
      },
    } as unknown as Job<AttendanceJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.recordsCreated).toBe(1);
    expect(mockAttendanceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceId: 'sess-uuid-1',
        courseId: 'CS101',
        studentId: 'STD-2',
        status: AttendanceStatus.ABSENT,
      }),
    );
    expect(mockAttendanceRepo.save).toHaveBeenCalledTimes(1);
  });

  it('should chunk save operations when records exceed 100', async () => {
    const mockStudents = Array.from({ length: 150 }, (_, i) => ({
      courseId: 'CS101',
      studentId: `STD-${i}`,
      student: { id: `STD-${i}`, status: StudentStatus.ACTIVE },
    }));

    mockCourseStudentRepo.find.mockResolvedValue(mockStudents);
    mockAttendanceRepo.find.mockResolvedValue([]); // No existing records

    const job = {
      id: 'att-job-chunk',
      data: {
        type: AttendanceJobType.INITIALIZE_ROSTER,
        sessionId: 'sess-large-1',
        courseId: 'CS101',
        date: '2026-11-03T10:00:00Z',
      },
    } as unknown as Job<AttendanceJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.recordsCreated).toBe(150);
    // 150 items split into 100 + 50 -> save called 2 times
    expect(mockAttendanceRepo.save).toHaveBeenCalledTimes(2);
  });

  it('should return 0 when no active enrolled students found', async () => {
    mockCourseStudentRepo.find.mockResolvedValue([]);

    const job = {
      id: 'att-job-empty',
      data: {
        type: AttendanceJobType.INITIALIZE_ROSTER,
        sessionId: 'sess-empty',
        courseId: 'CS999',
        date: '2026-11-03T08:00:00Z',
      },
    } as unknown as Job<AttendanceJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.recordsCreated).toBe(0);
    expect(mockAttendanceRepo.save).not.toHaveBeenCalled();
  });

  it('should return 0 when all active students already have records', async () => {
    mockCourseStudentRepo.find.mockResolvedValue([
      {
        courseId: 'CS101',
        studentId: 'STD-1',
        student: { id: 'STD-1', status: StudentStatus.ACTIVE },
      },
    ]);
    mockAttendanceRepo.find.mockResolvedValue([{ studentId: 'STD-1' }]);

    const job = {
      id: 'att-job-all-exist',
      data: {
        type: AttendanceJobType.INITIALIZE_ROSTER,
        sessionId: 'sess-1',
        courseId: 'CS101',
        date: '2026-11-03T08:00:00Z',
      },
    } as unknown as Job<AttendanceJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.recordsCreated).toBe(0);
    expect(mockAttendanceRepo.save).not.toHaveBeenCalled();
  });

  it('should throw an error for unsupported job type', async () => {
    const job = {
      id: 'att-job-invalid',
      data: {
        type: 'UNSUPPORTED_ATTENDANCE' as any,
      },
    } as unknown as Job<AttendanceJobData>;

    await expect(processor.process(job)).rejects.toThrow('Unsupported attendance job type: UNSUPPORTED_ATTENDANCE');
  });

  it('should rethrow error when courseStudentRepo throws an exception', async () => {
    mockCourseStudentRepo.find.mockRejectedValueOnce(new Error('Database connectivity error'));

    const job = {
      id: 'att-job-err',
      data: {
        type: AttendanceJobType.INITIALIZE_ROSTER,
        sessionId: 'sess-err',
        courseId: 'CS101',
        date: '2026-11-03T08:00:00Z',
      },
    } as unknown as Job<AttendanceJobData>;

    await expect(processor.process(job)).rejects.toThrow('Database connectivity error');
  });
});

