import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';
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
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationQueryDto,
  RegisterFcmTokenDto,
  DirectNotificationDto,
} from './dto';

describe('NotificationService', () => {
  let service: NotificationService;
  let notificationRepoMock: any;
  let readRepoMock: any;
  let fcmTokenRepoMock: any;
  let studentRepoMock: any;
  let courseRepoMock: any;
  let cacheServiceMock: any;
  let gatewayMock: any;
  let firebaseServiceMock: any;
  let queueServiceMock: any;
  let queryBuilderMock: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    queryBuilderMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    notificationRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto: any) => ({ ...dto })),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'notif-uuid-1', ...entity }),
      ),
      remove: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    readRepoMock = {
      findOne: jest.fn(),
      create: jest.fn((dto: any) => ({ ...dto })),
      save: jest.fn((entity: any) => Promise.resolve(entity)),
    };

    fcmTokenRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto: any) => ({ ...dto })),
      save: jest.fn((entity: any) =>
        Promise.resolve({ id: 'fcm-uuid-1', ...entity }),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    studentRepoMock = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    courseRepoMock = {
      findOne: jest.fn(),
    };

    cacheServiceMock = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      scanAndInvalidate: jest.fn().mockResolvedValue(undefined),
    };

    gatewayMock = {
      emitNewNotification: jest.fn(),
      emitUpdateNotification: jest.fn(),
      emitDeleteNotification: jest.fn(),
      emitDirectNotification: jest.fn(),
    };

    firebaseServiceMock = {
      sendMulticast: jest.fn().mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        invalidTokens: [],
      }),
      sendToToken: jest.fn().mockResolvedValue('msg-id-1'),
    };

    queueServiceMock = {
      sendEmail: jest.fn().mockResolvedValue('job-email-1'),
      sendSms: jest.fn().mockResolvedValue('job-sms-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getRepositoryToken(Notification),
          useValue: notificationRepoMock,
        },
        {
          provide: getRepositoryToken(NotificationRead),
          useValue: readRepoMock,
        },
        {
          provide: getRepositoryToken(FcmToken),
          useValue: fcmTokenRepoMock,
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
        {
          provide: NotificationGateway,
          useValue: gatewayMock,
        },
        {
          provide: FirebaseMessagingService,
          useValue: firebaseServiceMock,
        },
        {
          provide: QueueService,
          useValue: queueServiceMock,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createNotification', () => {
    it('should throw NotFoundException if sender student does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue(null);

      const dto: CreateNotificationDto = {
        title: 'New Announcement',
        message: 'Details here',
      };

      await expect(
        service.createNotification('invalid-sender', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if courseId provided but course not found', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'sender-1' });
      courseRepoMock.findOne.mockResolvedValue(null);

      const dto: CreateNotificationDto = {
        title: 'Course Announcement',
        message: 'Details here',
        courseId: 'invalid-course',
      };

      await expect(
        service.createNotification('sender-1', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create notification with defaults, emit WebSocket event, and dispatch FCM multicast', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'sender-1' });
      fcmTokenRepoMock.find.mockResolvedValue([
        { token: 'token-active-1' },
        { token: 'token-active-2' },
      ]);
      firebaseServiceMock.sendMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        invalidTokens: ['token-active-2'],
      });

      const dto: CreateNotificationDto = {
        title: 'Timetable Adjustment',
        message: 'Exam schedule shifted by 2 hours',
      };

      const result = await service.createNotification('sender-1', dto);

      expect(notificationRepoMock.create).toHaveBeenCalledWith({
        title: dto.title,
        message: dto.message,
        type: NotificationType.ANNOUNCEMENT,
        priority: NotificationPriority.NORMAL,
        senderId: 'sender-1',
        courseId: null,
      });
      expect(notificationRepoMock.save).toHaveBeenCalled();
      expect(gatewayMock.emitNewNotification).toHaveBeenCalled();
      expect(firebaseServiceMock.sendMulticast).toHaveBeenCalledWith(
        ['token-active-1', 'token-active-2'],
        expect.objectContaining({
          title: dto.title,
          body: dto.message,
        }),
      );
      // Prune invalid tokens
      expect(fcmTokenRepoMock.delete).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:notifications:*',
      );
      expect(result.id).toBe('notif-uuid-1');
    });

    it('should create course-specific notification with custom type and priority', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'sender-1' });
      courseRepoMock.findOne.mockResolvedValue({ id: 'course-1' });
      fcmTokenRepoMock.find.mockResolvedValue([]);

      const dto: CreateNotificationDto = {
        title: 'Assignment Deadline Extended',
        message: 'Project submission deadline extended by 48 hours',
        type: NotificationType.ASSIGNMENT,
        priority: NotificationPriority.HIGH,
        courseId: 'course-1',
      };

      const result = await service.createNotification('sender-1', dto);

      expect(notificationRepoMock.create).toHaveBeenCalledWith({
        title: dto.title,
        message: dto.message,
        type: NotificationType.ASSIGNMENT,
        priority: NotificationPriority.HIGH,
        senderId: 'sender-1',
        courseId: 'course-1',
      });
      expect(result.type).toBe(NotificationType.ASSIGNMENT);
      expect(result.priority).toBe(NotificationPriority.HIGH);
    });

    it('should dispatch urgent SMS alerts when notification priority is URGENT', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'sender-1' });
      studentRepoMock.find.mockResolvedValue([
        { id: 'st-1', phone: '+233200000001', name: 'Student 1' },
        { id: 'st-2', phone: null, name: 'Student 2' },
      ]);
      fcmTokenRepoMock.find.mockResolvedValue([]);

      const dto: CreateNotificationDto = {
        title: 'Emergency Class Relocation',
        message: 'Class relocated to Lab 3',
        priority: NotificationPriority.URGENT,
      };

      await service.createNotification('sender-1', dto);

      expect(queueServiceMock.sendSms).toHaveBeenCalledWith(
        '+233200000001',
        '[URGENT] Emergency Class Relocation: Class relocated to Lab 3',
        undefined,
        { userId: 'st-1' },
      );
    });

    it('should catch WebSocket and FCM dispatch errors gracefully without failing creation', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'sender-1' });
      gatewayMock.emitNewNotification.mockImplementation(() => {
        throw new Error('Socket pipe broken');
      });
      fcmTokenRepoMock.find.mockRejectedValue(new Error('DB disconnect'));

      const dto: CreateNotificationDto = {
        title: 'Resilient Broadcast',
        message: 'Should not crash when downstream fails',
      };

      const result = await service.createNotification('sender-1', dto);
      expect(result.id).toBe('notif-uuid-1');
    });
  });

  describe('getNotifications', () => {
    it('should return cached result when cache hit', async () => {
      const cachedResult = {
        items: [{ id: 'cached-1' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      cacheServiceMock.get.mockResolvedValue(cachedResult);

      const query: NotificationQueryDto = { page: 1, limit: 10 };
      const result = await service.getNotifications('student-1', query);

      expect(result).toBe(cachedResult);
      expect(notificationRepoMock.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should query notifications with all filters and populate isRead boolean', async () => {
      const mockNotifications = [
        {
          id: 'n-1',
          title: 'Notif 1',
          reads: [{ id: 'r-1', isRead: true }],
        },
        {
          id: 'n-2',
          title: 'Notif 2',
          reads: [],
        },
      ];

      queryBuilderMock.getManyAndCount.mockResolvedValue([
        mockNotifications,
        2,
      ]);

      const query: NotificationQueryDto = {
        page: 1,
        limit: 10,
        courseId: 'course-1',
        type: NotificationType.ANNOUNCEMENT,
        priority: NotificationPriority.HIGH,
        isRead: true,
        search: '  exam  ',
      };

      const result = await service.getNotifications('student-1', query);

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'notif.course_id = :courseId',
        { courseId: 'course-1' },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'notif.type = :type',
        { type: NotificationType.ANNOUNCEMENT },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'notif.priority = :priority',
        { priority: NotificationPriority.HIGH },
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        'reads.id IS NOT NULL AND reads.is_read = true',
      );
      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(notif.title ILIKE :search OR notif.message ILIKE :search)',
        { search: '%exam%' },
      );

      // Verify mapped items have isRead flag
      expect(result.items[0].isRead).toBe(true);
      expect(result.items[1].isRead).toBe(false);
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });

    it('should filter unread notifications when query.isRead is false', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 0]);

      const query: NotificationQueryDto = {
        page: 1,
        limit: 10,
        isRead: false,
      };

      await service.getNotifications('student-1', query);

      expect(queryBuilderMock.andWhere).toHaveBeenCalledWith(
        '(reads.id IS NULL OR reads.is_read = false)',
      );
    });

    it('should calculate pagination metadata properly when page > 1', async () => {
      queryBuilderMock.getManyAndCount.mockResolvedValue([[], 25]);

      const query: NotificationQueryDto = { page: 2, limit: 10 };
      const result = await service.getNotifications('student-1', query);

      expect(result.meta.totalPages).toBe(3);
      expect(result.meta.hasNextPage).toBe(true);
      expect(result.meta.hasPreviousPage).toBe(true);
    });
  });

  describe('getUnreadCount', () => {
    it('should count unread notifications for student', async () => {
      queryBuilderMock.getCount.mockResolvedValue(7);

      const result = await service.getUnreadCount('student-1');

      expect(result).toEqual({ unreadCount: 7 });
      expect(queryBuilderMock.where).toHaveBeenCalledWith(
        '(reads.id IS NULL OR reads.is_read = false)',
      );
    });
  });

  describe('getNotificationById', () => {
    it('should throw NotFoundException if notification does not exist', async () => {
      notificationRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.getNotificationById('invalid-id', 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return notification with isRead = true if read record exists', async () => {
      const mockNotif = { id: 'notif-1', title: 'Orientation' };
      notificationRepoMock.findOne.mockResolvedValue(mockNotif);
      readRepoMock.findOne.mockResolvedValue({ id: 'r-1', isRead: true });

      const result = await service.getNotificationById('notif-1', 'student-1');

      expect(result.isRead).toBe(true);
    });

    it('should return notification with isRead = false if read record does not exist', async () => {
      const mockNotif = { id: 'notif-2', title: 'Tutorial' };
      notificationRepoMock.findOne.mockResolvedValue(mockNotif);
      readRepoMock.findOne.mockResolvedValue(null);

      const result = await service.getNotificationById('notif-2', 'student-1');

      expect(result.isRead).toBe(false);
    });
  });

  describe('updateNotification', () => {
    it('should throw NotFoundException if notification not found', async () => {
      notificationRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateNotification('invalid-id', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if updated courseId does not exist', async () => {
      notificationRepoMock.findOne.mockResolvedValue({ id: 'notif-1' });
      courseRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.updateNotification('notif-1', { courseId: 'non-existent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update fields, emit WebSocket event, and invalidate cache', async () => {
      const notif: any = {
        id: 'notif-1',
        title: 'Old Title',
        message: 'Old Message',
      };
      notificationRepoMock.findOne.mockResolvedValue(notif);
      courseRepoMock.findOne.mockResolvedValue({ id: 'course-new' });

      const dto: UpdateNotificationDto = {
        title: 'New Title',
        message: 'New Message',
        type: NotificationType.EVENT,
        priority: NotificationPriority.URGENT,
        courseId: 'course-new',
      };

      const result = await service.updateNotification('notif-1', dto);

      expect(notif.title).toBe('New Title');
      expect(notif.message).toBe('New Message');
      expect(notif.type).toBe(NotificationType.EVENT);
      expect(notif.priority).toBe(NotificationPriority.URGENT);
      expect(gatewayMock.emitUpdateNotification).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:notifications:*',
      );
      expect(result).toBeDefined();
    });

    it('should handle WebSocket update emit exception gracefully', async () => {
      const notif = { id: 'notif-1' };
      notificationRepoMock.findOne.mockResolvedValue(notif);
      gatewayMock.emitUpdateNotification.mockImplementation(() => {
        throw new Error('Socket error');
      });

      const result = await service.updateNotification('notif-1', {
        title: 'Test',
      });
      expect(result).toBeDefined();
    });
  });

  describe('deleteNotification', () => {
    it('should throw NotFoundException if notification not found', async () => {
      notificationRepoMock.findOne.mockResolvedValue(null);

      await expect(service.deleteNotification('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should remove notification, emit WebSocket event, and invalidate cache', async () => {
      const notif = { id: 'notif-1' };
      notificationRepoMock.findOne.mockResolvedValue(notif);

      const result = await service.deleteNotification('notif-1');

      expect(notificationRepoMock.remove).toHaveBeenCalledWith(notif);
      expect(gatewayMock.emitDeleteNotification).toHaveBeenCalledWith('notif-1');
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:notifications:*',
      );
      expect(result).toEqual({ message: 'Notification deleted successfully' });
    });

    it('should handle WebSocket delete emit exception gracefully', async () => {
      const notif = { id: 'notif-1' };
      notificationRepoMock.findOne.mockResolvedValue(notif);
      gatewayMock.emitDeleteNotification.mockImplementation(() => {
        throw new Error('Socket error');
      });

      const result = await service.deleteNotification('notif-1');
      expect(result).toEqual({ message: 'Notification deleted successfully' });
    });
  });

  describe('markAsRead', () => {
    it('should throw NotFoundException if notification does not exist', async () => {
      notificationRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.markAsRead('invalid-notif', 'student-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create new read receipt if not already existing', async () => {
      notificationRepoMock.findOne.mockResolvedValue({ id: 'notif-1' });
      readRepoMock.findOne.mockResolvedValue(null);

      const result = await service.markAsRead('notif-1', 'student-1');

      expect(readRepoMock.create).toHaveBeenCalledWith({
        notificationId: 'notif-1',
        studentId: 'student-1',
        isRead: true,
        readAt: expect.any(Date),
      });
      expect(readRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:notifications:user:student-1:*',
      );
      expect(result).toEqual({ message: 'Notification marked as read' });
    });

    it('should update existing read receipt if already recorded', async () => {
      notificationRepoMock.findOne.mockResolvedValue({ id: 'notif-1' });
      const existingRead = {
        id: 'r-1',
        isRead: false,
        readAt: null,
      };
      readRepoMock.findOne.mockResolvedValue(existingRead);

      await service.markAsRead('notif-1', 'student-1');

      expect(existingRead.isRead).toBe(true);
      expect(existingRead.readAt).toBeInstanceOf(Date);
      expect(readRepoMock.save).toHaveBeenCalledWith(existingRead);
    });
  });

  describe('markAllAsRead', () => {
    it('should return 0 count if no unread notifications exist', async () => {
      queryBuilderMock.getRawMany.mockResolvedValue([]);

      const result = await service.markAllAsRead('student-1');

      expect(result).toEqual({
        message: 'All notifications already marked as read',
        markedCount: 0,
      });
      expect(readRepoMock.save).not.toHaveBeenCalled();
    });

    it('should bulk upsert read receipts for all unread notifications', async () => {
      queryBuilderMock.getRawMany.mockResolvedValue([
        { id: 'notif-1' },
        { id: 'notif-2' },
        { id: 'notif-3' },
      ]);

      const result = await service.markAllAsRead('student-1');

      expect(readRepoMock.create).toHaveBeenCalledTimes(3);
      expect(readRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.scanAndInvalidate).toHaveBeenCalledWith(
        'cr:notifications:user:student-1:*',
      );
      expect(result.markedCount).toBe(3);
    });
  });

  describe('registerFcmToken', () => {
    it('should throw NotFoundException if student does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue(null);

      const dto: RegisterFcmTokenDto = { token: 'token-abc' };

      await expect(
        service.registerFcmToken('invalid-student', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create new token record with 30-day expiry if not found', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      fcmTokenRepoMock.findOne.mockResolvedValue(null);

      const dto: RegisterFcmTokenDto = {
        token: 'new-fcm-token-123',
        deviceType: 'ios',
      };

      const result = await service.registerFcmToken('student-1', dto);

      expect(fcmTokenRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: 'student-1',
          token: 'new-fcm-token-123',
          deviceType: 'ios',
        }),
      );
      expect(fcmTokenRepoMock.save).toHaveBeenCalled();
      expect(result.message).toBe('FCM device token registered successfully');
    });

    it('should refresh expiration and update deviceType if token exists', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      const existingToken = {
        id: 'token-1',
        studentId: 'student-1',
        token: 'existing-fcm-token',
        deviceType: 'web',
        expiresAt: new Date('2026-01-01'),
      };
      fcmTokenRepoMock.findOne.mockResolvedValue(existingToken);

      const dto: RegisterFcmTokenDto = {
        token: 'existing-fcm-token',
        deviceType: 'android',
      };

      await service.registerFcmToken('student-1', dto);

      expect(existingToken.deviceType).toBe('android');
      expect(existingToken.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 25 * 24 * 60 * 60 * 1000,
      );
      expect(fcmTokenRepoMock.save).toHaveBeenCalledWith(existingToken);
    });
  });

  describe('sendDirectNotification', () => {
    it('should throw NotFoundException if student does not exist', async () => {
      studentRepoMock.findOne.mockResolvedValue(null);

      const dto: DirectNotificationDto = {
        studentId: 'invalid-id',
        message: 'Message',
      };

      await expect(
        service.sendDirectNotification('rep-1', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should send in-app and FCM push notification to student', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      fcmTokenRepoMock.find.mockResolvedValue([
        { token: 'student-fcm-token-1' },
      ]);

      const dto: DirectNotificationDto = {
        studentId: 'student-1',
        message: 'Please meet the rep after lectures',
        messageType: 'in_app',
        title: 'Meeting Request',
      };

      const result = await service.sendDirectNotification('rep-1', dto);

      expect(gatewayMock.emitDirectNotification).toHaveBeenCalledWith(
        'student-1',
        expect.objectContaining({
          title: 'Meeting Request',
          message: dto.message,
          messageType: 'in_app',
          senderId: 'rep-1',
        }),
      );
      expect(firebaseServiceMock.sendMulticast).toHaveBeenCalledWith(
        ['student-fcm-token-1'],
        expect.objectContaining({
          title: 'Meeting Request',
          body: dto.message,
        }),
      );
      expect(result).toEqual({
        message: 'Message queued for sending via in_app',
      });
    });

    it('should catch WebSocket and FCM errors gracefully during direct notification', async () => {
      studentRepoMock.findOne.mockResolvedValue({ id: 'student-1' });
      gatewayMock.emitDirectNotification.mockImplementation(() => {
        throw new Error('Socket broken');
      });
      fcmTokenRepoMock.find.mockRejectedValue(new Error('FCM DB error'));

      const dto: DirectNotificationDto = {
        studentId: 'student-1',
        message: 'Direct notification resilience check',
      };

      const result = await service.sendDirectNotification('rep-1', dto);
      expect(result.message).toBe('Message queued for sending via in_app');
    });

    it('should dispatch email and sms queue jobs when messageType is email or sms', async () => {
      studentRepoMock.findOne.mockResolvedValue({
        id: 'student-1',
        name: 'Student One',
        email: 'student@uni.edu',
        phone: '+233200000001',
      });
      fcmTokenRepoMock.find.mockResolvedValue([]);

      const emailDto: DirectNotificationDto = {
        studentId: 'student-1',
        message: 'Email direct notice',
        messageType: 'email',
      };
      await service.sendDirectNotification('rep-1', emailDto);
      expect(queueServiceMock.sendEmail).toHaveBeenCalled();

      const smsDto: DirectNotificationDto = {
        studentId: 'student-1',
        message: 'SMS direct notice',
        messageType: 'sms',
      };
      await service.sendDirectNotification('rep-1', smsDto);
      expect(queueServiceMock.sendSms).toHaveBeenCalledWith(
        '+233200000001',
        'SMS direct notice',
        undefined,
        { userId: 'student-1' },
      );
    });
  });
});
