import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import {
  CreateNotificationDto,
  UpdateNotificationDto,
  NotificationQueryDto,
  RegisterFcmTokenDto,
  DirectNotificationDto,
} from './dto';
import {
  NotificationType,
  NotificationPriority,
} from './entities/notification.entity';
import { UserRole } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

describe('NotificationController', () => {
  let controller: NotificationController;
  let serviceMock: {
    createNotification: jest.Mock;
    getNotifications: jest.Mock;
    getUnreadCount: jest.Mock;
    getNotificationById: jest.Mock;
    updateNotification: jest.Mock;
    deleteNotification: jest.Mock;
    markAsRead: jest.Mock;
    markAllAsRead: jest.Mock;
    registerFcmToken: jest.Mock;
    unregisterFcmToken: jest.Mock;
    getPushStatus: jest.Mock;
    sendDirectNotification: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'student@example.com',
    name: 'Sample Student',
    phone: '+233200000001',
    role: UserRole.STUDENT,
    isRep: false,
    status: 'ACTIVE',
  };

  const mockRepUser: AuthenticatedUser = {
    id: 'rep-uuid-1',
    email: 'rep@example.com',
    name: 'Sample Rep',
    phone: '+233200000002',
    role: UserRole.REP,
    isRep: true,
    status: 'ACTIVE',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    serviceMock = {
      createNotification: jest.fn(),
      getNotifications: jest.fn(),
      getUnreadCount: jest.fn(),
      getNotificationById: jest.fn(),
      updateNotification: jest.fn(),
      deleteNotification: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      registerFcmToken: jest.fn(),
      unregisterFcmToken: jest.fn(),
      getPushStatus: jest.fn(),
      sendDirectNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        {
          provide: NotificationService,
          useValue: serviceMock,
        },
      ],
    }).compile();

    controller = module.get<NotificationController>(NotificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createNotification', () => {
    it('should delegate to service.createNotification', async () => {
      const dto: CreateNotificationDto = {
        title: 'New Announcement',
        message: 'Midterm timetable has been updated',
        type: NotificationType.ANNOUNCEMENT,
        priority: NotificationPriority.HIGH,
      };

      const expected = { id: 'notif-1', ...dto, senderId: mockRepUser.id };
      serviceMock.createNotification.mockResolvedValue(expected);

      const result = await controller.createNotification(mockRepUser, dto);

      expect(serviceMock.createNotification).toHaveBeenCalledWith(
        mockRepUser.id,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getNotifications', () => {
    it('should delegate to service.getNotifications', async () => {
      const query: NotificationQueryDto = {
        page: 1,
        limit: 10,
        type: NotificationType.ANNOUNCEMENT,
      };

      const expected = {
        items: [],
        meta: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      serviceMock.getNotifications.mockResolvedValue(expected);

      const result = await controller.getNotifications(mockUser, query);

      expect(serviceMock.getNotifications).toHaveBeenCalledWith(
        mockUser.id,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getUnreadCount', () => {
    it('should delegate to service.getUnreadCount', async () => {
      const expected = { unreadCount: 5 };
      serviceMock.getUnreadCount.mockResolvedValue(expected);

      const result = await controller.getUnreadCount(mockUser);

      expect(serviceMock.getUnreadCount).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(expected);
    });
  });

  describe('getNotificationById', () => {
    it('should delegate to service.getNotificationById', async () => {
      const expected = { id: 'notif-1', title: 'Notification Details' };
      serviceMock.getNotificationById.mockResolvedValue(expected);

      const result = await controller.getNotificationById('notif-1', mockUser);

      expect(serviceMock.getNotificationById).toHaveBeenCalledWith(
        'notif-1',
        mockUser.id,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('updateNotification', () => {
    it('should delegate to service.updateNotification', async () => {
      const dto: UpdateNotificationDto = {
        title: 'Updated Title',
        priority: NotificationPriority.URGENT,
      };
      const expected = { id: 'notif-1', ...dto };
      serviceMock.updateNotification.mockResolvedValue(expected);

      const result = await controller.updateNotification('notif-1', dto);

      expect(serviceMock.updateNotification).toHaveBeenCalledWith(
        'notif-1',
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('deleteNotification', () => {
    it('should delegate to service.deleteNotification', async () => {
      const expected = { message: 'Notification deleted successfully' };
      serviceMock.deleteNotification.mockResolvedValue(expected);

      const result = await controller.deleteNotification('notif-1');

      expect(serviceMock.deleteNotification).toHaveBeenCalledWith('notif-1');
      expect(result).toEqual(expected);
    });
  });

  describe('markAsRead', () => {
    it('should delegate to service.markAsRead', async () => {
      const expected = { message: 'Notification marked as read' };
      serviceMock.markAsRead.mockResolvedValue(expected);

      const result = await controller.markAsRead('notif-1', mockUser);

      expect(serviceMock.markAsRead).toHaveBeenCalledWith(
        'notif-1',
        mockUser.id,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('markAllAsRead', () => {
    it('should delegate to service.markAllAsRead', async () => {
      const expected = {
        message: 'All notifications successfully marked as read',
        markedCount: 8,
      };
      serviceMock.markAllAsRead.mockResolvedValue(expected);

      const result = await controller.markAllAsRead(mockUser);

      expect(serviceMock.markAllAsRead).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(expected);
    });
  });

  describe('registerFcmToken', () => {
    it('should delegate to service.registerFcmToken', async () => {
      const dto: RegisterFcmTokenDto = {
        token: 'fcm-registration-token-abc',
        deviceType: 'android',
      };
      const expected = {
        message: 'FCM device token registered successfully',
        token: { id: 'token-uuid', token: dto.token } as any,
      };
      serviceMock.registerFcmToken.mockResolvedValue(expected);

      const result = await controller.registerFcmToken(mockUser, dto);

      expect(serviceMock.registerFcmToken).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('unregisterFcmToken', () => {
    it('should delegate to service.unregisterFcmToken', async () => {
      const dto = { token: 'device-token-123' };
      const expected = {
        message: 'Push notifications turned off successfully',
        enabled: false,
        unregisteredCount: 1,
      };
      serviceMock.unregisterFcmToken.mockResolvedValue(expected);

      const result = await controller.unregisterFcmToken(mockUser, dto);

      expect(serviceMock.unregisterFcmToken).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });

  describe('getPushStatus', () => {
    it('should delegate to service.getPushStatus', async () => {
      const expected = {
        enabled: true,
        tokenCount: 1,
      };
      serviceMock.getPushStatus.mockResolvedValue(expected);

      const result = await controller.getPushStatus(mockUser);

      expect(serviceMock.getPushStatus).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(expected);
    });
  });

  describe('sendDirectNotification', () => {
    it('should delegate to service.sendDirectNotification', async () => {
      const dto: DirectNotificationDto = {
        studentId: 'target-student-id',
        message: 'Please submit your assignment before 5 PM',
        messageType: 'in_app',
      };
      const expected = {
        message: 'Message queued for sending via in_app',
      };
      serviceMock.sendDirectNotification.mockResolvedValue(expected);

      const result = await controller.sendDirectNotification(
        mockRepUser,
        dto,
      );

      expect(serviceMock.sendDirectNotification).toHaveBeenCalledWith(
        mockRepUser.id,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });
});
