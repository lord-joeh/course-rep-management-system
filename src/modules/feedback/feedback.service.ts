import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  Feedback,
  FeedbackCategory,
  FeedbackPriority,
  FeedbackStatus,
} from './entities/feedback.entity';
import { Student } from '../student/entities/student.entity';
import { Course } from '../course/entities/course.entity';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { NotificationDispatcherService } from '../notification/services/notification-dispatcher.service';
import {
  CreateFeedbackDto,
  UpdateFeedbackStatusDto,
  FeedbackQueryDto,
} from './dto';
import { PaginatedResult } from '../../common/pagination';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';
import { UserRole } from '../../common/decorators/roles.decorator';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly cacheService: CacheService,
    private readonly queueService: QueueService,
    private readonly notificationDispatcher: NotificationDispatcherService,
  ) {}

  /**
   * Submit feedback with guaranteed user binding (IDOR protection).
   */
  async createFeedback(
    studentId: string,
    dto: CreateFeedbackDto,
  ): Promise<Feedback> {
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student "${studentId}" not found`);
    }

    if (dto.courseId) {
      const course = await this.courseRepository.findOne({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException(`Course "${dto.courseId}" not found`);
      }
    }

    const feedback = this.feedbackRepository.create({
      studentId,
      courseId: dto.courseId || null,
      category: dto.category || FeedbackCategory.GENERAL,
      title: dto.title,
      content: dto.content,
      isAnonymous: Boolean(dto.isAnonymous),
      priority: dto.priority || FeedbackPriority.MEDIUM,
      status: FeedbackStatus.SUBMITTED,
    });

    const saved = await this.feedbackRepository.save(feedback);

    // Dispatch centralized feedback confirmation notification for non-anonymous submissions
    if (!dto.isAnonymous) {
      await this.notificationDispatcher.dispatchFeedbackReceived({
        student: { id: student.id, name: student.name, email: student.email },
      });
    }

    await this.cacheService.scanAndInvalidate('cr:feedback:*');
    return saved;
  }

  /**
   * List paginated feedback with privacy masking and multi-criteria filters.
   * Rep directory.
   */
  async getFeedbacks(query: FeedbackQueryDto): Promise<PaginatedResult<any>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const search = query.search?.trim();
    const cacheKey = `cr:feedback:${query.courseId || 'all'}:${query.category || 'all'}:${query.priority || 'all'}:${query.status || 'all'}:${query.isAnonymous !== undefined ? query.isAnonymous : 'all'}:${page}:${limit}:${search || ''}`;

    const cached = await this.cacheService.get<PaginatedResult<any>>(cacheKey);
    if (cached) return cached;

    const qb = this.feedbackRepository
      .createQueryBuilder('fb')
      .leftJoinAndSelect('fb.student', 'student')
      .leftJoinAndSelect('fb.course', 'course');

    if (query.status) {
      qb.andWhere('fb.status = :status', { status: query.status });
    }

    if (query.category) {
      qb.andWhere('fb.category = :category', { category: query.category });
    }

    if (query.priority) {
      qb.andWhere('fb.priority = :priority', { priority: query.priority });
    }

    if (query.courseId) {
      qb.andWhere('fb.course_id = :courseId', { courseId: query.courseId });
    }

    if (query.isAnonymous !== undefined) {
      qb.andWhere('fb.is_anonymous = :isAnonymous', {
        isAnonymous: query.isAnonymous,
      });
    }

    if (search) {
      qb.andWhere(
        '(fb.title ILIKE :search OR fb.content ILIKE :search OR fb.rep_response ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('fb.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [feedbacks, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    // Redact student profile for anonymous submissions
    const items = feedbacks.map((f) => {
      if (f.isAnonymous) {
        return {
          ...f,
          studentId: null,
          student: { name: 'Anonymous Student' },
        };
      }
      return f;
    });

    const result: PaginatedResult<any> = {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Retrieve personal feedback submissions for authenticated student.
   */
  async getMyFeedbacks(
    studentId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResult<Feedback>> {
    const qb = this.feedbackRepository
      .createQueryBuilder('fb')
      .leftJoinAndSelect('fb.course', 'course')
      .where('fb.studentId = :studentId', { studentId })
      .orderBy('fb.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Retrieve a single feedback by ID with strict ownership validation.
   */
  async getFeedbackById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<any> {
    const feedback = await this.feedbackRepository.findOne({
      where: { id },
      relations: ['student', 'course'],
    });

    if (!feedback) {
      throw new NotFoundException(`Feedback "${id}" not found`);
    }

    const isRep = user.role === UserRole.REP || user.isRep;
    const isOwner = feedback.studentId === user.id;

    if (!isRep && !isOwner) {
      throw new ForbiddenException(
        'You do not have permission to view this feedback',
      );
    }

    // Mask identity for reps if submitted anonymously
    if (feedback.isAnonymous && isRep && !isOwner) {
      return {
        ...feedback,
        studentId: null,
        student: { name: 'Anonymous Student' },
      };
    }

    return feedback;
  }

  /**
   * Update feedback triage status and provide official Course Rep response.
   * Rep only.
   */
  async updateStatus(
    id: string,
    repId: string,
    dto: UpdateFeedbackStatusDto,
  ): Promise<Feedback> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`Feedback "${id}" not found`);
    }

    feedback.status = dto.status;

    if (dto.repResponse !== undefined) {
      feedback.repResponse = dto.repResponse;
      feedback.respondedAt = new Date();
      feedback.respondedBy = repId;
    }

    const updated = await this.feedbackRepository.save(feedback);
    await this.cacheService.scanAndInvalidate('cr:feedback:*');
    return updated;
  }

  /**
   * Permanently delete a feedback entry.
   * Rep only.
   */
  async deleteFeedback(id: string): Promise<{ message: string }> {
    const feedback = await this.feedbackRepository.findOne({ where: { id } });
    if (!feedback) {
      throw new NotFoundException(`Feedback "${id}" not found`);
    }

    await this.feedbackRepository.remove(feedback);
    await this.cacheService.scanAndInvalidate('cr:feedback:*');
    return { message: 'Feedback successfully deleted' };
  }
}

