import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotificationDispatcherService,
} from './notification-dispatcher.service';
import { NotificationService } from '../notification.service';
import { FirebaseMessagingService } from '../firebase-messaging.service';
import { QueueService } from '../../queue/queue.service';
import { EmailJobType } from '../../queue/constants';
import {
  NotificationType,
  NotificationPriority,
} from '../entities/notification.entity';
import { FcmToken } from '../entities/fcm-token.entity';
import { Student } from '../../student/entities/student.entity';
import { Course } from '../../course/entities/course.entity';
import { CourseStudent } from '../../course/entities/course-student.entity';
import { NotificationChannel } from '../constants/notification-channel.enum';

describe('NotificationDispatcherService', () => {
  let dispatcher: NotificationDispatcherService;
  let notificationServiceMock: {
    createNotification: jest.Mock;
    sendDirectNotification: jest.Mock;
  };
  let firebaseServiceMock: {
    sendMulticast: jest.Mock;
  };
  let queueServiceMock: {
    sendEmail: jest.Mock;
    sendSms: jest.Mock;
  };
  let courseRepoMock: {
    findOne: jest.Mock;
  };
  let courseStudentRepoMock: {
    find: jest.Mock;
  };
  let studentRepoMock: {
    findOne: jest.Mock;
  };
  let fcmTokenRepoMock: {
    find: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    notificationServiceMock = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }),
      sendDirectNotification: jest.fn().mockResolvedValue({ success: true }),
    };
    firebaseServiceMock = {
      sendMulticast: jest.fn().mockResolvedValue({ successCount: 1, invalidTokens: [] }),
    };
    queueServiceMock = {
      sendEmail: jest.fn().mockResolvedValue('job-email-1'),
      sendSms: jest.fn().mockResolvedValue('job-sms-1'),
    };
    courseRepoMock = {
      findOne: jest.fn().mockResolvedValue({ id: 'CS101', name: 'Computer Science 101' }),
    };
    courseStudentRepoMock = {
      find: jest.fn().mockResolvedValue([
        { studentId: 'std-1', student: { id: 'std-1', name: 'John', email: 'john@uni.edu', phone: '0241234567' } },
      ]),
    };
    studentRepoMock = {
      findOne: jest.fn().mockResolvedValue({ id: 'std-1', name: 'John', email: 'john@uni.edu', phone: '0241234567' }),
    };
    fcmTokenRepoMock = {
      find: jest.fn().mockResolvedValue([{ token: 'fcm-token-1' }]),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatcherService,
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: FirebaseMessagingService, useValue: firebaseServiceMock },
        { provide: QueueService, useValue: queueServiceMock },
        { provide: getRepositoryToken(Course), useValue: courseRepoMock },
        { provide: getRepositoryToken(CourseStudent), useValue: courseStudentRepoMock },
        { provide: getRepositoryToken(Student), useValue: studentRepoMock },
        { provide: getRepositoryToken(FcmToken), useValue: fcmTokenRepoMock },
      ],
    }).compile();

    dispatcher = module.get<NotificationDispatcherService>(NotificationDispatcherService);
  });

  it('should be defined', () => {
    expect(dispatcher).toBeDefined();
  });

  describe('dispatchSlideUploaded', () => {
    it('should format single slide notification and dispatch to in-app & push', async () => {
      await dispatcher.dispatchSlideUploaded({
        courseId: 'CS101',
        slides: [{ id: 'slide-1', fileName: 'Lecture1.pdf' }],
        uploaderId: 'rep-1',
      });

      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith('rep-1', {
        title: 'New Slide: Computer Science 101',
        message: 'A new slide "Lecture1.pdf" was uploaded for Computer Science 101.',
        type: NotificationType.SLIDE,
        priority: NotificationPriority.NORMAL,
        courseId: 'CS101',
      });
    });

    it('should format multiple slides notification with slide count', async () => {
      await dispatcher.dispatchSlideUploaded({
        courseId: 'CS101',
        courseName: 'CS101 Advanced',
        slides: [
          { id: 's-1', fileName: 'L1.pdf' },
          { id: 's-2', fileName: 'L2.pdf' },
        ],
      });

      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(null, {
        title: 'New Slides: CS101 Advanced',
        message: '2 new slides were uploaded for CS101 Advanced: L1.pdf, L2.pdf.',
        type: NotificationType.SLIDE,
        priority: NotificationPriority.NORMAL,
        courseId: 'CS101',
      });
    });

    it('should gracefully isolate errors if notification service fails', async () => {
      notificationServiceMock.createNotification.mockRejectedValueOnce(new Error('DB failure'));

      await expect(
        dispatcher.dispatchSlideUploaded({
          courseId: 'CS101',
          slides: [{ id: 's-1', fileName: 'L1.pdf' }],
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('dispatchAssignmentCreated', () => {
    it('should format assignment notification with deadline', async () => {
      const deadline = new Date('2026-12-01T23:59:00Z');
      await dispatcher.dispatchAssignmentCreated({
        courseId: 'CS101',
        assignment: { id: 'asg-1', title: 'Data Structures Project', deadline },
        creatorId: 'rep-1',
      });

      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(
        'rep-1',
        expect.objectContaining({
          title: 'New Assignment: Data Structures Project',
          type: NotificationType.ASSIGNMENT,
          priority: NotificationPriority.NORMAL,
          courseId: 'CS101',
        }),
      );
    });
  });

  describe('dispatchAttendanceSessionCreated', () => {
    it('should format attendance notification with mode and high priority', async () => {
      const expiresAt = new Date(Date.now() + 3600000);
      await dispatcher.dispatchAttendanceSessionCreated({
        courseId: 'CS101',
        instance: { id: 'inst-1', classType: 'in_person', expiresAt },
        creatorId: 'rep-1',
      });

      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(
        'rep-1',
        expect.objectContaining({
          title: 'Attendance Active: Computer Science 101',
          type: NotificationType.ATTENDANCE,
          priority: NotificationPriority.HIGH,
          courseId: 'CS101',
        }),
      );
    });
  });

  describe('dispatchAcademicEventCreated', () => {
    it('should format single event notification', async () => {
      await dispatcher.dispatchAcademicEventCreated({
        event: {
          id: 'evt-1',
          title: 'Midterm Revision',
          startDate: new Date('2026-11-20T10:00:00Z'),
          endDate: new Date('2026-11-20T12:00:00Z'),
          venue: 'Auditorium A',
          isRecurring: false,
        },
        courseId: 'CS101',
        creatorId: 'rep-1',
      });

      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(
        'rep-1',
        expect.objectContaining({
          title: 'New Event: Midterm Revision',
          type: NotificationType.EVENT,
          priority: NotificationPriority.NORMAL,
          courseId: 'CS101',
        }),
      );
    });

    it('should format recurring event series with recurring indicator', async () => {
      await dispatcher.dispatchAcademicEventCreated({
        event: {
          id: 'series-1',
          title: 'Weekly Tutorial',
          startDate: new Date('2026-11-20T10:00:00Z'),
          endDate: new Date('2026-11-20T12:00:00Z'),
          venue: 'Lab 2',
          isRecurring: true,
        },
      });

      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          title: 'New Event: Weekly Tutorial',
          message: expect.stringContaining('(Recurring series)'),
          type: NotificationType.EVENT,
        }),
      );
    });
  });

  describe('dispatchRegistrationSuccess', () => {
    it('should enqueue welcome email and optional in-app alert', async () => {
      await dispatcher.dispatchRegistrationSuccess({
        student: { id: 'std-1', name: 'Alice Doe', email: 'alice@uni.edu' },
        channels: [NotificationChannel.EMAIL, NotificationChannel.IN_APP],
      });

      expect(queueServiceMock.sendEmail).toHaveBeenCalledWith(
        EmailJobType.REGISTRATION_SUCCESS,
        {
          to: 'alice@uni.edu',
          name: 'Alice Doe',
        },
      );
      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          title: 'Welcome to Course Rep Portal',
        }),
      );
    });
  });

  describe('dispatchPasswordReset', () => {
    it('should enqueue password reset email', async () => {
      await dispatcher.dispatchPasswordReset({
        student: { id: 'std-1', name: 'Alice', email: 'alice@uni.edu' },
        resetToken: 'hex-token-123',
        resetUrl: 'http://localhost:5173/reset-password?token=hex-token-123',
      });

      expect(queueServiceMock.sendEmail).toHaveBeenCalledWith(
        EmailJobType.PASSWORD_RESET,
        {
          to: 'alice@uni.edu',
          name: 'Alice',
          resetToken: 'hex-token-123',
        },
      );
    });
  });

  describe('dispatchPasswordChanged', () => {
    it('should enqueue security alert email and in-app notice', async () => {
      await dispatcher.dispatchPasswordChanged({
        student: { id: 'std-1', name: 'Alice', email: 'alice@uni.edu' },
      });

      expect(queueServiceMock.sendEmail).toHaveBeenCalledWith(
        EmailJobType.PASSWORD_CHANGED,
        {
          to: 'alice@uni.edu',
          name: 'Alice',
        },
      );
    });
  });

  describe('dispatchFeedbackReceived', () => {
    it('should enqueue feedback confirmation email', async () => {
      await dispatcher.dispatchFeedbackReceived({
        student: { id: 'std-1', name: 'Alice', email: 'alice@uni.edu' },
      });

      expect(queueServiceMock.sendEmail).toHaveBeenCalledWith(
        EmailJobType.FEEDBACK_RECEIVED,
        {
          to: 'alice@uni.edu',
          name: 'Alice',
        },
      );
    });
  });

  describe('dispatchGroupAssigned', () => {
    it('should enqueue group assignment email and in-app notification', async () => {
      await dispatcher.dispatchGroupAssigned({
        student: { id: 'std-1', name: 'Alice', email: 'alice@uni.edu' },
        groupName: 'Group Alpha',
        role: 'Leader',
      });

      expect(queueServiceMock.sendEmail).toHaveBeenCalledWith(
        EmailJobType.GROUP_ASSIGNMENT,
        expect.objectContaining({
          to: 'alice@uni.edu',
          groupName: 'Group Alpha',
          role: 'Leader',
        }),
      );
      expect(notificationServiceMock.createNotification).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          title: 'Group Assigned: Group Alpha',
        }),
      );
    });
  });

  describe('dispatchDirectStudentMessage', () => {
    it('should delegate to notificationService.sendDirectNotification', async () => {
      await dispatcher.dispatchDirectStudentMessage({
        targetStudentId: 'std-99',
        title: 'Meeting Tomorrow',
        message: 'Please meet the rep at 10 AM.',
        senderId: 'rep-1',
      });

      expect(notificationServiceMock.sendDirectNotification).toHaveBeenCalledWith(
        'rep-1',
        {
          studentId: 'std-99',
          title: 'Meeting Tomorrow',
          message: 'Please meet the rep at 10 AM.',
          messageType: 'in_app',
        },
      );
    });
  });

  describe('multi-channel direct push & email blasts', () => {
    it('should dispatch direct push when PUSH channel requested without IN_APP', async () => {
      await dispatcher.dispatchSlideUploaded({
        courseId: 'CS101',
        slides: [{ id: 's-1', fileName: 'Slide.pdf' }],
        channels: [NotificationChannel.PUSH],
      });

      expect(firebaseServiceMock.sendMulticast).toHaveBeenCalled();
    });

    it('should dispatch course email blast when EMAIL channel is included', async () => {
      await dispatcher.dispatchSlideUploaded({
        courseId: 'CS101',
        slides: [{ id: 's-1', fileName: 'Slide.pdf' }],
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      });

      expect(queueServiceMock.sendEmail).toHaveBeenCalledWith(
        EmailJobType.STUDENT_MESSAGE,
        expect.objectContaining({
          to: 'john@uni.edu',
        }),
      );
    });

    it('should dispatch course SMS blast when SMS channel is included', async () => {
      await dispatcher.dispatchAttendanceSessionCreated({
        courseId: 'CS101',
        instance: { id: 'inst-1', classType: 'in_person', expiresAt: new Date() },
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
      });

      expect(queueServiceMock.sendSms).toHaveBeenCalledWith(
        '0241234567',
        expect.stringContaining('Attendance Active'),
        undefined,
        { userId: 'std-1' },
      );
    });
  });
});

