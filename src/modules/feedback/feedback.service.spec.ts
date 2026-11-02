import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import {
  Feedback,
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
} from './entities/feedback.entity';
import { Student } from '../student/entities/student.entity';
import { Course } from '../course/entities/course.entity';
import { CacheService } from '../redis/cache.service';
import {
  CreateFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto';
import { UserRole } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let feedbackRepoMock: any;
  let studentRepoMock: any;
  let courseRepoMock: any;
  let cacheServiceMock: any;
  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    feedbackRepoMock = {
      findOne: jest.fn(),
      create: jest.fn((dto: any) => ({ ...dto })),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'fb-uuid-1', ...entity }),
      ),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    studentRepoMock = {
      findOne: jest.fn(),
    };

    courseRepoMock = {
      findOne: jest.fn(),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      scanAndInvalidate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        {
          provide: getRepositoryToken(Feedback),
          useValue: feedbackRepoMock,
        },
        {
          provide: getRepositoryToken(Student),
          useValue: studentRepoMock,
        },
        {
          provide: getRepositoryToken(Course),
          useValue: courseRepoMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createFeedback', () => {
    it('should throw NotFoundException if student does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue(null);

      const dto: CreateFeedbackDto = {
        title: 'Projector Issue',
        content: 'HDMI connection is broken.',
      };

      await expect(
        service.createFeedback('invalid-student-id', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if courseId provided but course does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      courseRepoMock.findOne.mockResolvedValue(null);

      const dto: CreateFeedbackDto = {
        title: 'Syllabus mismatch',
        content: 'Topics covered differ from outline.',
        courseId: 'invalid-course-id',
      };

      await expect(
        service.createFeedback('student-1', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should successfully create feedback with defaults when optional fields are omitted', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });

      const dto: CreateFeedbackDto = {
        title: 'General Suggestion',
        content: 'Could we get water dispensers on the 2nd floor?',
      };

      const result = await service.createFeedback('student-1', dto);

      expect(feedbackRepoMock.create).toHaveBeenCalledWith({
        studentId: 'student-1',
        courseId: null,
        category: FeedbackCategory.GENERAL,
        title: dto.title,
        content: dto.content,
        isAnonymous: false,
        priority: FeedbackPriority.MEDIUM,
        status: FeedbackStatus.SUBMITTED,
      });
      expect(feedbackRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:feedback:*',
      );
      expect(result.id).toBe('fb-uuid-1');
      expect(result.status).toBe(FeedbackStatus.SUBMITTED);
    });

    it('should create feedback with custom courseId, category, priority, and anonymous flag', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      courseRepoMock.findOne.mockResolvedValue({ id: 'course-1' });

      const dto: CreateFeedbackDto = {
        title: 'Hard midterm exam',
        content: 'We need a revision session before finals.',
        courseId: 'course-1',
        category: FeedbackCategory.ACADEMIC,
        priority: FeedbackPriority.HIGH,
        isAnonymous: true,
      };

      const result = await service.createFeedback('student-1', dto);

      expect(courseRepoMock.findOne).toHaveBeenCalledWith({
        where: { id: 'course-1' },
      });
      expect(feedbackRepoMock.create).toHaveBeenCalledWith({
        studentId: 'student-1',
        courseId: 'course-1',
        category: FeedbackCategory.ACADEMIC,
        title: dto.title,
        content: dto.content,
        isAnonymous: true,
        priority: FeedbackPriority.HIGH,
        status: FeedbackStatus.SUBMITTED,
      });
      expect(result.isAnonymous).toBe(true);
      expect(result.category).toBe(FeedbackCategory.ACADEMIC);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:feedback:*',
      );
    });
  });

  describe('getFeedbacks', () => {
    it('should return cached result if present', async () => {
      const cachedResult = {
        items: [{ id: 'cached-fb' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      cacheServiceMock.get.mockResolvedValue(cachedResult);

      const query: FeedbackQueryDto = {
        page: 1,
        limit: 10,
        status: FeedbackStatus.SUBMITTED,
      };

      const result = await service.getFeedbacks(query);

      expect(result).toBe(cachedResult);
      expect(feedbackRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query feedback with all filters and mask anonymous submitters', async () => {
      const feedbacksMock = [
        {
          id: 'fb-1',
          studentId: 'student-100',
          title: 'Anonymous report',
          content: 'Details here',
          isAnonymous: true,
          student: { id: 'student-100', name: 'John Doe', email: 'john@example.com' },
          course: { id: 'csc-301', code: 'CSC 301' },
        },
        {
          id: 'fb-2',
          studentId: 'student-200',
          title: 'Public suggestion',
          content: 'More group study rooms',
          isAnonymous: false,
          student: { id: 'student-200', name: 'Jane Smith', email: 'jane@example.com' },
          course: null,
        },
      ];

      queryBuilderMock.getManyAndCount.mockResolvedValue([feedbacksMock, 2]);

      const query: FeedbackQueryDto = {
        page: 1,
        limit: 10,
        status: FeedbackStatus.SUBMITTED,
        category: FeedbackCategory.ACADEMIC,
        priority: FeedbackPriority.HIGH,
        courseId: 'csc-301',
        isAnonymous: true,
        search: '  study  ',
      };

      const result = await service.getFeedbacks(query);

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'fb.status = :status',
        { status: FeedbackStatus.SUBMITTED },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'fb.category = :category',
        { category: FeedbackCategory.ACADEMIC },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'fb.priority = :priority',
        { priority: FeedbackPriority.HIGH },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'fb.course_id = :courseId',
        { courseId: 'csc-301' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'fb.is_anonymous = :isAnonymous',
        { isAnonymous: true },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(fb.title ILIKE :search OR fb.content ILIKE :search OR fb.rep_response ILIKE :search)',
        { search: '%study%' },
      );

      // Verify anonymous masking
      expect(result.items[0].studentId).toBeNull();
      expect(result.items[0].student).toEqual({ name: 'Anonymous Student' });

      // Verify non-anonymous preservation
      expect(result.items[1].studentId).toBe('student-200');
      expect(result.items[1].student.name).toBe('Jane Smith');

      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);

      expect(cacheServiceMock.set).toHaveBeenCalled();
    });

    it('should handle pagination when page > 1 and page < totalPages', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 35]);

      const query: FeedbackQueryDto = {
        page: 2,
        limit: 10,
      };

      const result = await service.getFeedbacks(query);

      expect(queryBuilderMock.skip).toHaveBeenCalledWith(10);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(10);
      expect(result.meta.totalPages).toBe(4);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(true);
    });

    it('should handle zero total items and return totalPages 1', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const query: FeedbackQueryDto = { page: 1, limit: 10 };

      const result = await service.getFeedbacks(query);

      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(1);
      expect(result.meta.hasNextPage).toBe(false);
      expect(result.meta.hasPreviousPage).toBe(false);
    });
  });

  describe('getMyFeedbacks', () => {
    it('should query feedback for the specific student with pagination', async () => {
      const myItems = [
        {
          id: 'fb-1',
          studentId: 'my-student-id',
          title: 'My Feedback',
          course: { id: 'c-1', code: 'CSC 201' },
        },
      ];
      queryBuilderMock.getManyAndCount.mockResolvedValue([myItems, 1]);

      const result = await service.getMyFeedbacks('my-student-id', 1, 10);

      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        'fb.studentId = :studentId',
        { studentId: 'my-student-id' },
      );
      expect(queryBuilderMock.skip).toHaveBeenCalledWith(0);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(10);
      expect(result.items).toEqual(myItems);
      expect(result.meta.total).toBe(1);
    });

    it('should use default page and limit if not supplied', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.getMyFeedbacks('my-student-id');

      expect(queryBuilderMock.skip).toHaveBeenCalledWith(0);
      expect(queryBuilderMock.take).toHaveBeenCalledWith(10);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('getFeedbackById', () => {
    it('should throw NotFoundException if feedback does not exist', async () => {
      feedbackRepoMock.findOne.mockResolvedValue(null);

      const user: AuthenticatedUser = {
        id: 'user-1',
        email: 'user@example.com',
        name: 'User One',
        phone: '+233200000001',
        role: UserRole.STUDENT,
        isRep: false,
        status: 'ACTIVE',
      };

      await expect(
        service.getFeedbackById('non-existent-id', user),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not owner and not Course Rep', async () => {
      feedbackRepoMock.findOne.mockResolvedValue({
        id: 'fb-1',
        studentId: 'other-student-id',
        title: 'Private Issue',
      });

      const user: AuthenticatedUser = {
        id: 'my-student-id',
        email: 'student@example.com',
        name: 'My Student',
        phone: '+233200000002',
        role: UserRole.STUDENT,
        isRep: false,
        status: 'ACTIVE',
      };

      await expect(service.getFeedbackById('fb-1', user)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow student owner to view their own anonymous feedback without masking', async () => {
      const feedback = {
        id: 'fb-1',
        studentId: 'student-owner-id',
        isAnonymous: true,
        title: 'My anonymous feedback',
        student: { id: 'student-owner-id', name: 'Alice' },
      };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const user: AuthenticatedUser = {
        id: 'student-owner-id',
        email: 'alice@example.com',
        name: 'Alice',
        phone: '+233200000003',
        role: UserRole.STUDENT,
        isRep: false,
        status: 'ACTIVE',
      };

      const result = await service.getFeedbackById('fb-1', user);

      expect(result.studentId).toBe('student-owner-id');
      expect(result.student.name).toBe('Alice');
    });

    it('should mask identity for a Course Rep when viewing an anonymous feedback', async () => {
      const feedback = {
        id: 'fb-1',
        studentId: 'some-student-id',
        isAnonymous: true,
        title: 'Harassment report',
        student: { id: 'some-student-id', name: 'Secret Student' },
      };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const repUser: AuthenticatedUser = {
        id: 'rep-uuid-1',
        email: 'rep@example.com',
        name: 'Rep User',
        phone: '+233200000004',
        role: UserRole.REP,
        isRep: true,
        status: 'ACTIVE',
      };

      const result = await service.getFeedbackById('fb-1', repUser);

      expect(result.studentId).toBeNull();
      expect(result.student).toEqual({ name: 'Anonymous Student' });
    });

    it('should not mask identity for a Course Rep when feedback is not anonymous', async () => {
      const feedback = {
        id: 'fb-2',
        studentId: 'some-student-id',
        isAnonymous: false,
        title: 'Class trip suggestion',
        student: { id: 'some-student-id', name: 'Bob' },
      };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const repUser: AuthenticatedUser = {
        id: 'rep-uuid-1',
        email: 'rep@example.com',
        name: 'Rep User',
        phone: '+233200000004',
        role: UserRole.REP,
        isRep: true,
        status: 'ACTIVE',
      };

      const result = await service.getFeedbackById('fb-2', repUser);

      expect(result.studentId).toBe('some-student-id');
      expect(result.student.name).toBe('Bob');
    });

    it('should recognize isRep boolean flag even if role is STUDENT', async () => {
      const feedback = {
        id: 'fb-2',
        studentId: 'some-student-id',
        isAnonymous: false,
        title: 'Class trip suggestion',
        student: { id: 'some-student-id', name: 'Bob' },
      };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const userWithRepFlag: AuthenticatedUser = {
        id: 'user-with-flag',
        email: 'repflag@example.com',
        name: 'Student With Flag',
        phone: '+233200000005',
        role: UserRole.STUDENT,
        isRep: true,
        status: 'ACTIVE',
      };

      const result = await service.getFeedbackById('fb-2', userWithRepFlag);
      expect(result.id).toBe('fb-2');
    });
  });

  describe('updateStatus', () => {
    it('should throw NotFoundException if feedback does not exist', async () => {
      feedbackRepoMock.findOne.mockResolvedValue(null);

      const dto: UpdateFeedbackStatusDto = {
        status: FeedbackStatus.UNDER_REVIEW,
      };

      await expect(
        service.updateStatus('invalid-fb-id', 'rep-id', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update status without touching repResponse if repResponse is undefined', async () => {
      const feedback = {
        id: 'fb-1',
        status: FeedbackStatus.SUBMITTED,
        repResponse: null,
        respondedAt: null,
        respondedBy: null,
      };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const dto: UpdateFeedbackStatusDto = {
        status: FeedbackStatus.UNDER_REVIEW,
      };

      await service.updateStatus('fb-1', 'rep-id', dto);

      expect(feedback.status).toBe(FeedbackStatus.UNDER_REVIEW);
      expect(feedback.repResponse).toBeNull();
      expect(feedback.respondedBy).toBeNull();
      expect(feedbackRepoMock.save).toHaveBeenCalledWith(feedback);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:feedback:*',
      );
    });

    it('should update status and record official Rep response details', async () => {
      const feedback = {
        id: 'fb-1',
        status: FeedbackStatus.SUBMITTED,
        repResponse: null,
        respondedAt: null,
        respondedBy: null,
      };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const dto: UpdateFeedbackStatusDto = {
        status: FeedbackStatus.RESOLVED,
        repResponse: 'Exam scheduled moved to Thursday as requested.',
      };

      await service.updateStatus('fb-1', 'rep-101', dto);

      expect(feedback.status).toBe(FeedbackStatus.RESOLVED);
      expect(feedback.repResponse).toBe(
        'Exam scheduled moved to Thursday as requested.',
      );
      expect(feedback.respondedBy).toBe('rep-101');
      expect(feedback.respondedAt).toBeInstanceOf(Date);
      expect(feedbackRepoMock.save).toHaveBeenCalledWith(feedback);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:feedback:*',
      );
    });
  });

  describe('deleteFeedback', () => {
    it('should throw NotFoundException if feedback does not exist', async () => {
      feedbackRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteFeedback('invalid-fb-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should remove feedback and invalidate cache', async () => {
      const feedback = { id: 'fb-1', title: 'To be removed' };
      feedbackRepoMock.findOne.mockResolvedValue(feedback);

      const result = await service.deleteFeedback('fb-1');

      expect(feedbackRepoMock.remove).toHaveBeenCalledWith(feedback);
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:feedback:*',
      );
      expect(result).toEqual({ message: 'Feedback successfully deleted' });
    });
  });
});
