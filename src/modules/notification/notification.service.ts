import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, In } from 'typeorm';

import {
  Notification,
  NotificationType,
  NotificationPriority,
} from './entities/notification.entity';
import { NotificationRead } from './entities/notification-read.entity';
import { FcmToken } from './entities/fcm-token.entity';
import { Student } from '../student/entities/student.entity';
import { Course } from '../course/entities/course.entity';
import { CacheService } from '../redis/cache.service';
import { NotificationGateway } from './notification.gateway';
import { FirebaseMessagingService } from './firebase-messaging.service';
import { QueueService } from '../queue/queue.service';
import { EmailJobType } from '../queue/constants';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationQueryDto,
  RegisterFcmTokenDto,
  DirectNotificationDto,
} from './dto';
import { PaginatedResult } from '../../common/pagination';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationRead)
    private readonly readRepository: Repository<NotificationRead>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepository: Repository<FcmToken>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly cacheService: CacheService,
    private readonly notificationGateway: NotificationGateway,
    private readonly firebaseService: FirebaseMessagingService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Create and broadcast announcement via WebSockets and FCM push notifications.
   * Rep only.
   */
  async createNotification(
    senderId: string,
    dto: CreateNotificationDto,
  ): Promise<Notification> {
    const sender = await this.studentRepository.findOne({
      where: { id: senderId },
    });
    if (!sender) {
      throw new NotFoundException(`Sender student "${senderId}" not found`);
    }

    if (dto.courseId) {
      const course = await this.courseRepository.findOne({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException(`Course "${dto.courseId}" not found`);
      }
    }

    const notification = this.notificationRepository.create({
      title: dto.title,
      message: dto.message,
      type: dto.type || NotificationType.ANNOUNCEMENT,
      priority: dto.priority || NotificationPriority.NORMAL,
      senderId,
      courseId: dto.courseId || null,
    });

    const saved = await this.notificationRepository.save(notification);

    // 1. Emit real-time WebSocket event
    try {
      this.notificationGateway.emitNewNotification(saved);
    } catch (wsError: any) {
      this.logger.error(`WebSocket notification emit error: ${wsError?.message || wsError}`);
    }

    // 2. Multicast FCM push to active subscriber tokens
    try {
      const activeTokens = await this.fcmTokenRepository.find({
        where: { expiresAt: MoreThan(new Date()) },
      });

      if (activeTokens.length > 0) {
        const tokenStrings = activeTokens.map((t) => t.token);
        const result = await this.firebaseService.sendMulticast(tokenStrings, {
          title: saved.title,
          body: saved.message,
          data: {
            notificationId: saved.id,
            type: saved.type,
            priority: saved.priority,
          },
        });

        // Prune stale/unregistered tokens
        if (result.invalidTokens.length > 0) {
          await this.fcmTokenRepository.delete({
            token: In(result.invalidTokens),
          });
          this.logger.log(
            `Pruned ${result.invalidTokens.length} invalid FCM tokens from registry`,
          );
        }
      }
    } catch (fcmError: any) {
      this.logger.error(`FCM multicast dispatch error: ${fcmError?.message || fcmError}`);
    }

    // 3. Dispatch urgent SMS alerts to active students with phone numbers
    if (saved.priority === NotificationPriority.URGENT) {
      try {
        const recipients = await this.studentRepository.find({
          where: { status: 'active' as any },
          select: ['id', 'phone', 'name'],
        });
        const smsMessage = `[URGENT] ${saved.title}: ${saved.message}`;
        for (const recipient of recipients) {
          if (recipient.phone) {
            await this.queueService.sendSms(recipient.phone, smsMessage, undefined, {
              userId: recipient.id,
            });
          }
        }
      } catch (smsError: any) {
        this.logger.error(`Urgent SMS queue dispatch error: ${smsError?.message || smsError}`);
      }
    }

    // 4. Invalidate Redis notification caches
    await this.cacheService.scanAndInvalidate('cr:notifications:*');

    return saved;
  }

  /**
   * Retrieve paginated notifications with personal isRead flag for requesting student.
   */
  async getNotifications(
    studentId: string,
    query: NotificationQueryDto,
  ): Promise<PaginatedResult<Notification>> {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const search = query.search?.trim();

    const cacheKey = `cr:notifications:user:${studentId}:${query.courseId || 'all'}:${query.type || 'all'}:${query.priority || 'all'}:${query.isRead !== undefined ? query.isRead : 'all'}:${page}:${limit}:${search || ''}`;

    const cached =
      await this.cacheService.get<PaginatedResult<Notification>>(cacheKey);
    if (cached) return cached;

    const qb = this.notificationRepository
      .createQueryBuilder('notif')
      .leftJoinAndSelect('notif.course', 'course')
      .leftJoinAndSelect('notif.sender', 'sender')
      .leftJoin(
        'notif.reads',
        'reads',
        'reads.student_id = :studentId',
        { studentId },
      )
      .addSelect(['reads.id', 'reads.isRead', 'reads.readAt']);

    if (query.courseId) {
      qb.andWhere('notif.course_id = :courseId', { courseId: query.courseId });
    }

    if (query.type) {
      qb.andWhere('notif.type = :type', { type: query.type });
    }

    if (query.priority) {
      qb.andWhere('notif.priority = :priority', { priority: query.priority });
    }

    if (query.isRead === true) {
      qb.andWhere('reads.id IS NOT NULL AND reads.is_read = true');
    } else if (query.isRead === false) {
      qb.andWhere('(reads.id IS NULL OR reads.is_read = false)');
    }

    if (search) {
      qb.andWhere(
        '(notif.title ILIKE :search OR notif.message ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('notif.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    // Populate isRead boolean for each notification
    const processedItems = items.map((notif) => {
      const isRead = Boolean(
        notif.reads && notif.reads.length > 0 && notif.reads[0].isRead,
      );
      return {
        ...notif,
        isRead,
        reads: undefined, // remove internal relation payload for clean API response
      } as unknown as Notification;
    });

    const result: PaginatedResult<Notification> = {
      items: processedItems,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    await this.cacheService.set(cacheKey, result, 120);
    return result;
  }

  /**
   * Fast unread notification counter for app badge icon.
   */
  async getUnreadCount(studentId: string): Promise<{ unreadCount: number }> {
    const count = await this.notificationRepository
      .createQueryBuilder('notif')
      .leftJoin(
        'notif.reads',
        'reads',
        'reads.student_id = :studentId',
        { studentId },
      )
      .where('(reads.id IS NULL OR reads.is_read = false)')
      .getCount();

    return { unreadCount: count };
  }

  /**
   * Retrieve single notification details with personal isRead flag.
   */
  async getNotificationById(
    id: string,
    studentId: string,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['course', 'sender'],
    });

    if (!notification) {
      throw new NotFoundException(`Notification "${id}" not found`);
    }

    const read = await this.readRepository.findOne({
      where: { notificationId: id, studentId },
    });

    notification.isRead = Boolean(read?.isRead);
    return notification;
  }

  /**
   * Update announcement details.
   * Rep only.
   */
  async updateNotification(
    id: string,
    dto: UpdateNotificationDto,
  ): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
      relations: ['course', 'sender'],
    });

    if (!notification) {
      throw new NotFoundException(`Notification "${id}" not found`);
    }

    if (dto.courseId) {
      const course = await this.courseRepository.findOne({
        where: { id: dto.courseId },
      });
      if (!course) {
        throw new NotFoundException(`Course "${dto.courseId}" not found`);
      }
      notification.courseId = dto.courseId;
    }

    if (dto.title !== undefined) notification.title = dto.title;
    if (dto.message !== undefined) notification.message = dto.message;
    if (dto.type !== undefined) notification.type = dto.type;
    if (dto.priority !== undefined) notification.priority = dto.priority;

    const updated = await this.notificationRepository.save(notification);

    try {
      this.notificationGateway.emitUpdateNotification(updated);
    } catch (wsError: any) {
      this.logger.error(`WebSocket update emit error: ${wsError?.message || wsError}`);
    }

    await this.cacheService.scanAndInvalidate('cr:notifications:*');
    return updated;
  }

  /**
   * Delete an announcement.
   * Cascades related reads.
   * Rep only.
   */
  async deleteNotification(id: string): Promise<{ message: string }> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });
    if (!notification) {
      throw new NotFoundException(`Notification "${id}" not found`);
    }

    await this.notificationRepository.remove(notification);

    try {
      this.notificationGateway.emitDeleteNotification(id);
    } catch (wsError: any) {
      this.logger.error(`WebSocket delete emit error: ${wsError?.message || wsError}`);
    }

    await this.cacheService.scanAndInvalidate('cr:notifications:*');
    return { message: 'Notification deleted successfully' };
  }

  /**
   * Mark individual notification as read.
   */
  async markAsRead(
    notificationId: string,
    studentId: string,
  ): Promise<{ message: string }> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new NotFoundException(`Notification "${notificationId}" not found`);
    }

    let read = await this.readRepository.findOne({
      where: { notificationId, studentId },
    });

    if (!read) {
      read = this.readRepository.create({
        notificationId,
        studentId,
        isRead: true,
        readAt: new Date(),
      });
    } else {
      read.isRead = true;
      read.readAt = new Date();
    }

    await this.readRepository.save(read);
    await this.cacheService.scanAndInvalidate(
      `cr:notifications:user:${studentId}:*`,
    );

    return { message: 'Notification marked as read' };
  }

  /**
   * Bulk mark all notifications as read for current student.
   */
  async markAllAsRead(
    studentId: string,
  ): Promise<{ message: string; markedCount: number }> {
    // Find unread notification IDs
    const unreadNotifications = await this.notificationRepository
      .createQueryBuilder('notif')
      .leftJoin(
        'notif.reads',
        'reads',
        'reads.student_id = :studentId',
        { studentId },
      )
      .where('(reads.id IS NULL OR reads.is_read = false)')
      .select('notif.id', 'id')
      .getRawMany();

    if (unreadNotifications.length === 0) {
      return { message: 'All notifications already marked as read', markedCount: 0 };
    }

    const readsToUpsert = unreadNotifications.map((n) =>
      this.readRepository.create({
        notificationId: n.id,
        studentId,
        isRead: true,
        readAt: new Date(),
      }),
    );

    await this.readRepository.save(readsToUpsert);
    await this.cacheService.scanAndInvalidate(
      `cr:notifications:user:${studentId}:*`,
    );

    return {
      message: 'All notifications successfully marked as read',
      markedCount: readsToUpsert.length,
    };
  }

  /**
   * Register or refresh FCM device registration token with 30-day sliding TTL.
   */
  async registerFcmToken(
    studentId: string,
    dto: RegisterFcmTokenDto,
  ): Promise<{ message: string; token: FcmToken }> {
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student "${studentId}" not found`);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    let tokenRecord = await this.fcmTokenRepository.findOne({
      where: { studentId, token: dto.token },
    });

    if (tokenRecord) {
      tokenRecord.expiresAt = expiresAt;
      if (dto.deviceType) tokenRecord.deviceType = dto.deviceType;
    } else {
      tokenRecord = this.fcmTokenRepository.create({
        studentId,
        token: dto.token,
        deviceType: dto.deviceType || 'web',
        expiresAt,
      });
    }

    try {
      const saved = await this.fcmTokenRepository.save(tokenRecord);
      return {
        message: 'FCM device token registered successfully',
        token: saved,
      };
    } catch (err: any) {
      // Gracefully handle PostgreSQL 23505 unique constraint violation (IDX_c5e3e17ca5e2e418fe87fca995)
      // in the event of concurrent client registration race conditions
      if (
        err?.code === '23505' ||
        err?.message?.includes('duplicate key value') ||
        err?.name === 'QueryFailedError'
      ) {
        const existing = await this.fcmTokenRepository.findOne({
          where: { studentId, token: dto.token },
        });
        if (existing) {
          existing.expiresAt = expiresAt;
          if (dto.deviceType) existing.deviceType = dto.deviceType;
          const updated = await this.fcmTokenRepository.save(existing);
          return {
            message: 'FCM device token registered successfully',
            token: updated,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Send direct targeted notification to a specific student (in-app, email, or sms).
   * Rep only.
   */
  async sendDirectNotification(
    senderId: string,
    dto: DirectNotificationDto,
  ): Promise<{ message: string }> {
    const student = await this.studentRepository.findOne({
      where: { id: dto.studentId },
    });
    if (!student) {
      throw new NotFoundException(`Student "${dto.studentId}" not found`);
    }

    const messageType = dto.messageType || 'in_app';
    const title = dto.title || 'Direct Message from Course Rep';

    // 1. In-app WebSocket emit to user room
    try {
      this.notificationGateway.emitDirectNotification(dto.studentId, {
        title,
        message: dto.message,
        messageType,
        senderId,
        sentAt: new Date(),
      });
    } catch (wsError: any) {
      this.logger.error(`WebSocket direct emit error: ${wsError?.message || wsError}`);
    }

    // 2. Direct FCM push to student's active device tokens
    try {
      const studentTokens = await this.fcmTokenRepository.find({
        where: {
          studentId: dto.studentId,
          expiresAt: MoreThan(new Date()),
        },
      });

      if (studentTokens.length > 0) {
        const tokens = studentTokens.map((t) => t.token);
        const result = await this.firebaseService.sendMulticast(tokens, {
          title,
          body: dto.message,
          data: { senderId, messageType },
        });

        if (result && result.invalidTokens && result.invalidTokens.length > 0) {
          await this.fcmTokenRepository.delete({
            token: In(result.invalidTokens),
          });
          this.logger.log(
            `Pruned ${result.invalidTokens.length} stale/invalid FCM tokens for student "${dto.studentId}"`,
          );
        }
      }
    } catch (fcmError: any) {
      this.logger.error(`Direct push error: ${fcmError?.message || fcmError}`);
    }

    // 3. Email dispatch if requested
    if (messageType === 'email' && student.email) {
      await this.queueService.sendEmail(EmailJobType.STUDENT_MESSAGE, {
        to: student.email,
        name: student.name,
        message: dto.message,
      });
    }

    // 4. SMS dispatch if requested
    if (messageType === 'sms' && student.phone) {
      await this.queueService.sendSms(student.phone, dto.message, undefined, {
        userId: student.id,
      });
    }

    this.logger.log(
      `Direct notification sent to student "${dto.studentId}" via ${messageType}`,
    );

    return { message: `Message queued for sending via ${messageType}` };
  }
}
