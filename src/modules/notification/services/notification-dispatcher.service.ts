import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';

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

export interface BaseDispatchOptions {
  channels?: NotificationChannel[];
}

export interface SlideUploadDispatchPayload extends BaseDispatchOptions {
  courseId: string;
  courseName?: string;
  slides: { id: string; fileName: string }[];
  uploaderId?: string;
}

export interface AssignmentCreatedDispatchPayload extends BaseDispatchOptions {
  courseId: string;
  courseName?: string;
  assignment: { id: string; title: string; deadline?: Date | string | null };
  creatorId?: string;
}

export interface AttendanceSessionDispatchPayload extends BaseDispatchOptions {
  courseId: string;
  courseName?: string;
  instance: { id: string; classType: string; expiresAt: Date | string };
  creatorId?: string;
}

export interface AcademicEventDispatchPayload extends BaseDispatchOptions {
  event: {
    id: string;
    title: string;
    startDate: Date | string;
    endDate: Date | string;
    venue: string;
    isRecurring?: boolean;
  };
  courseId?: string | null;
  courseName?: string;
  creatorId?: string;
}

export interface RegistrationSuccessDispatchPayload extends BaseDispatchOptions {
  student: { id: string; name: string; email?: string };
}

export interface PasswordResetDispatchPayload extends BaseDispatchOptions {
  student: { id: string; name: string; email: string };
  resetToken: string;
  resetUrl?: string;
}

export interface PasswordChangedDispatchPayload extends BaseDispatchOptions {
  student: { id: string; name: string; email?: string };
}

export interface FeedbackReceivedDispatchPayload extends BaseDispatchOptions {
  student: { id: string; name: string; email?: string };
}

export interface GroupAssignedDispatchPayload extends BaseDispatchOptions {
  student: { id: string; name: string; email?: string };
  groupName: string;
  role: string;
  groupMembers?: any[];
}

export interface DirectMessageDispatchPayload extends BaseDispatchOptions {
  targetStudentId: string;
  title?: string;
  message: string;
  senderId?: string;
}

export interface CustomNotificationDispatchPayload extends BaseDispatchOptions {
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  courseId?: string | null;
  senderId?: string | null;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly firebaseService: FirebaseMessagingService,
    private readonly queueService: QueueService,
    @InjectRepository(CourseStudent)
    private readonly courseStudentRepository: Repository<CourseStudent>,
    @InjectRepository(Student)
    private readonly studentRepository: Repository<Student>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepository: Repository<FcmToken>,
  ) {}

  /**
   * 1. Dispatch Slide Uploaded Notification across chosen channels.
   * Default channels: [IN_APP, PUSH]
   */
  async dispatchSlideUploaded(payload: SlideUploadDispatchPayload): Promise<void> {
    const channels = payload.channels || [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
    ];

    try {
      const courseTitle =
        payload.courseName ||
        (await this.resolveCourseName(payload.courseId)) ||
        payload.courseId;

      const count = payload.slides.length;
      const title =
        count === 1
          ? `New Slide: ${courseTitle}`
          : `New Slides: ${courseTitle}`;

      const message =
        count === 1
          ? `A new slide "${payload.slides[0].fileName}" was uploaded for ${courseTitle}.`
          : `${count} new slides were uploaded for ${courseTitle}: ${payload.slides.map((s) => s.fileName).join(', ')}.`;

      await this.dispatchNotificationCore({
        title,
        message,
        type: NotificationType.SLIDE,
        priority: NotificationPriority.NORMAL,
        courseId: payload.courseId,
        senderId: payload.uploaderId,
        channels,
      });
    } catch (err: any) {
      this.logger.warn(`Slide upload notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 2. Dispatch Assignment Created Notification across chosen channels.
   * Default channels: [IN_APP, PUSH]
   */
  async dispatchAssignmentCreated(
    payload: AssignmentCreatedDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
    ];

    try {
      const courseTitle =
        payload.courseName ||
        (await this.resolveCourseName(payload.courseId)) ||
        payload.courseId;

      const title = `New Assignment: ${payload.assignment.title}`;
      let deadlineStr = '';
      if (payload.assignment.deadline) {
        const d = new Date(payload.assignment.deadline);
        if (!isNaN(d.getTime())) {
          deadlineStr = ` Due: ${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
        }
      }

      const message = `A new assignment "${payload.assignment.title}" has been posted for ${courseTitle}.${deadlineStr}`;

      await this.dispatchNotificationCore({
        title,
        message,
        type: NotificationType.ASSIGNMENT,
        priority: NotificationPriority.NORMAL,
        courseId: payload.courseId,
        senderId: payload.creatorId,
        channels,
      });
    } catch (err: any) {
      this.logger.warn(`Assignment notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 3. Dispatch Attendance Session Active Notification across chosen channels.
   * Default channels: [IN_APP, PUSH]
   */
  async dispatchAttendanceSessionCreated(
    payload: AttendanceSessionDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
    ];

    try {
      const courseTitle =
        payload.courseName ||
        (await this.resolveCourseName(payload.courseId)) ||
        payload.courseId;

      const title = `Attendance Active: ${courseTitle}`;
      const expires = new Date(payload.instance.expiresAt);
      const timeStr = !isNaN(expires.getTime())
        ? expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'soon';

      const mode =
        payload.instance.classType?.toLowerCase() === 'in_person'
          ? 'In-Person'
          : 'Online';

      const message = `Attendance check-in is now open for ${courseTitle} (${mode}). Check in before ${timeStr}.`;

      await this.dispatchNotificationCore({
        title,
        message,
        type: NotificationType.ATTENDANCE,
        priority: NotificationPriority.HIGH,
        courseId: payload.courseId,
        senderId: payload.creatorId,
        channels,
      });
    } catch (err: any) {
      this.logger.warn(`Attendance session notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 4. Dispatch Academic Event Added Notification across chosen channels.
   * Default channels: [IN_APP, PUSH]
   */
  async dispatchAcademicEventCreated(
    payload: AcademicEventDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
    ];

    try {
      const title = `New Event: ${payload.event.title}`;
      const d = new Date(payload.event.startDate);
      const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString() : 'Upcoming';
      const recurringStr = payload.event.isRecurring ? ' (Recurring series)' : '';

      const message = `Event "${payload.event.title}" scheduled for ${dateStr} at ${payload.event.venue}.${recurringStr}`;

      await this.dispatchNotificationCore({
        title,
        message,
        type: NotificationType.EVENT,
        priority: NotificationPriority.NORMAL,
        courseId: payload.courseId || null,
        senderId: payload.creatorId,
        channels,
      });
    } catch (err: any) {
      this.logger.warn(`Event notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 5. Dispatch User Registration Success.
   * Default channels: [EMAIL]
   */
  async dispatchRegistrationSuccess(
    payload: RegistrationSuccessDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [NotificationChannel.EMAIL];

    try {
      if (channels.includes(NotificationChannel.EMAIL) && payload.student.email) {
        await this.queueService.sendEmail(EmailJobType.REGISTRATION_SUCCESS, {
          to: payload.student.email,
          name: payload.student.name,
        });
      }

      if (channels.includes(NotificationChannel.IN_APP)) {
        await this.notificationService.createNotification(null, {
          title: 'Welcome to Course Rep Portal',
          message: `Hello ${payload.student.name}! Your account has been registered successfully.`,
          type: NotificationType.SYSTEM,
          priority: NotificationPriority.NORMAL,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Registration success notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 6. Dispatch Password Reset Token.
   * Default channels: [EMAIL]
   */
  async dispatchPasswordReset(
    payload: PasswordResetDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [NotificationChannel.EMAIL];

    try {
      if (channels.includes(NotificationChannel.EMAIL) && payload.student.email) {
        await this.queueService.sendEmail(EmailJobType.PASSWORD_RESET, {
          to: payload.student.email,
          name: payload.student.name,
          resetToken: payload.resetToken,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Password reset email dispatch skipped: ${err?.message || err}`);
    }
  }

  /**
   * 7. Dispatch Password Changed Security Notice.
   * Default channels: [EMAIL]
   */
  async dispatchPasswordChanged(
    payload: PasswordChangedDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [NotificationChannel.EMAIL];

    try {
      if (channels.includes(NotificationChannel.EMAIL) && payload.student.email) {
        await this.queueService.sendEmail(EmailJobType.PASSWORD_CHANGED, {
          to: payload.student.email,
          name: payload.student.name,
        });
      }

      if (channels.includes(NotificationChannel.IN_APP)) {
        await this.notificationService.createNotification(null, {
          title: 'Security Alert: Password Changed',
          message: 'Your account password was recently changed. If you did not make this change, please contact your Course Representative immediately.',
          type: NotificationType.SYSTEM,
          priority: NotificationPriority.HIGH,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Password changed notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 8. Dispatch Feedback Received Acknowledgment.
   * Default channels: [EMAIL]
   */
  async dispatchFeedbackReceived(
    payload: FeedbackReceivedDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [NotificationChannel.EMAIL];

    try {
      if (channels.includes(NotificationChannel.EMAIL) && payload.student.email) {
        await this.queueService.sendEmail(EmailJobType.FEEDBACK_RECEIVED, {
          to: payload.student.email,
          name: payload.student.name,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Feedback received acknowledgment skipped: ${err?.message || err}`);
    }
  }

  /**
   * 9. Dispatch Academic Group Assigned Notice.
   * Default channels: [EMAIL, IN_APP]
   */
  async dispatchGroupAssigned(
    payload: GroupAssignedDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [
      NotificationChannel.EMAIL,
      NotificationChannel.IN_APP,
    ];

    try {
      if (channels.includes(NotificationChannel.EMAIL) && payload.student.email) {
        await this.queueService.sendEmail(EmailJobType.GROUP_ASSIGNMENT, {
          to: payload.student.email,
          name: payload.student.name,
          groupName: payload.groupName,
          role: payload.role,
          groupMembers: payload.groupMembers,
        });
      }

      if (channels.includes(NotificationChannel.IN_APP)) {
        await this.notificationService.createNotification(null, {
          title: `Group Assigned: ${payload.groupName}`,
          message: `You have been added to ${payload.groupName} as a ${payload.role}.`,
          type: NotificationType.SYSTEM,
          priority: NotificationPriority.NORMAL,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Group assignment notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * 10. Dispatch Direct Message to a specific student.
   * Default channels: [IN_APP]
   */
  async dispatchDirectStudentMessage(
    payload: DirectMessageDispatchPayload,
  ): Promise<void> {
    const channels = payload.channels || [NotificationChannel.IN_APP];

    try {
      await this.notificationService.sendDirectNotification(
        payload.senderId || 'SYSTEM',
        {
          studentId: payload.targetStudentId,
          title: payload.title || 'Direct Notification',
          message: payload.message,
          messageType: channels.includes(NotificationChannel.SMS)
            ? 'sms'
            : channels.includes(NotificationChannel.EMAIL)
              ? 'email'
              : 'in_app',
        },
      );
    } catch (err: any) {
      this.logger.warn(`Direct student notification skipped: ${err?.message || err}`);
    }
  }

  /**
   * Unified multi-channel notification core:
   * Handles in-app persistence, WebSocket broadcast, FCM multicast, and optional course email/sms blasts.
   */
  private async dispatchNotificationCore(payload: {
    title: string;
    message: string;
    type: NotificationType;
    priority: NotificationPriority;
    courseId?: string | null;
    senderId?: string | null;
    channels: NotificationChannel[];
  }): Promise<void> {
    // 1. In-App persistence & WebSockets
    if (payload.channels.includes(NotificationChannel.IN_APP)) {
      await this.notificationService.createNotification(payload.senderId || null, {
        title: payload.title,
        message: payload.message,
        type: payload.type,
        priority: payload.priority,
        courseId: payload.courseId || undefined,
      });
    }

    // 2. Direct FCM Multicast Push (if PUSH requested and not already covered by createNotification)
    // Note: NotificationService.createNotification automatically fires FCM push when priority > LOW.
    // If IN_APP was not selected but PUSH was selected, we dispatch FCM directly here:
    if (
      payload.channels.includes(NotificationChannel.PUSH) &&
      !payload.channels.includes(NotificationChannel.IN_APP)
    ) {
      await this.dispatchPushDirectly({
        title: payload.title,
        message: payload.message,
        type: payload.type,
        priority: payload.priority,
        courseId: payload.courseId,
      });
    }

    // 3. Optional Bulk Email Channel
    if (payload.channels.includes(NotificationChannel.EMAIL) && payload.courseId) {
      await this.dispatchCourseEmailBlast(payload.courseId, payload.title, payload.message);
    }

    // 4. Optional Bulk SMS Channel
    if (payload.channels.includes(NotificationChannel.SMS) && payload.courseId) {
      await this.dispatchCourseSmsBlast(payload.courseId, `${payload.title}: ${payload.message}`);
    }
  }

  /**
   * Helper: Directly dispatch FCM push to target recipients.
   */
  private async dispatchPushDirectly(params: {
    title: string;
    message: string;
    type: NotificationType;
    priority: NotificationPriority;
    courseId?: string | null;
  }): Promise<void> {
    try {
      let activeTokens: FcmToken[] = [];
      if (params.courseId) {
        const enrollments = await this.courseStudentRepository.find({
          where: { courseId: params.courseId },
          select: ['studentId'],
        });
        const enrolledIds = enrollments.map((e) => e.studentId);
        if (enrolledIds.length > 0) {
          activeTokens = await this.fcmTokenRepository.find({
            where: {
              studentId: In(enrolledIds),
              expiresAt: MoreThan(new Date()),
            },
          });
        }
      } else {
        activeTokens = await this.fcmTokenRepository.find({
          where: { expiresAt: MoreThan(new Date()) },
        });
      }

      if (activeTokens.length > 0) {
        const tokenStrings = activeTokens.map((t) => t.token);
        const result = await this.firebaseService.sendMulticast(tokenStrings, {
          title: params.title,
          body: params.message,
          data: {
            type: params.type,
            priority: params.priority,
          },
        });

        if (result.invalidTokens.length > 0) {
          await this.fcmTokenRepository.delete({ token: In(result.invalidTokens) });
        }
      }
    } catch (err: any) {
      this.logger.error(`Direct push dispatch failed: ${err?.message || err}`);
    }
  }

  /**
   * Helper: Dispatches email to all enrolled students for a course.
   */
  private async dispatchCourseEmailBlast(
    courseId: string,
    subject: string,
    message: string,
  ): Promise<void> {
    try {
      const enrollments = await this.courseStudentRepository.find({
        where: { courseId },
        relations: ['student'],
      });

      for (const e of enrollments) {
        if (e.student?.email) {
          await this.queueService.sendEmail(EmailJobType.STUDENT_MESSAGE, {
            to: e.student.email,
            subject,
            message,
            name: e.student.name,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Course email blast failed: ${err?.message || err}`);
    }
  }

  /**
   * Helper: Dispatches SMS to all enrolled students for a course with phone numbers.
   */
  private async dispatchCourseSmsBlast(
    courseId: string,
    message: string,
  ): Promise<void> {
    try {
      const enrollments = await this.courseStudentRepository.find({
        where: { courseId },
        relations: ['student'],
      });

      for (const e of enrollments) {
        if (e.student?.phone) {
          await this.queueService.sendSms(e.student.phone, message, undefined, {
            userId: e.student.id,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Course SMS blast failed: ${err?.message || err}`);
    }
  }

  /**
   * Helper: Resolves a human-readable course name by courseId.
   */
  private async resolveCourseName(courseId: string): Promise<string | null> {
    try {
      const course = await this.courseRepository.findOne({
        where: { id: courseId },
        select: ['id', 'name'],
      });
      return course?.name || null;
    } catch {
      return null;
    }
  }
}

