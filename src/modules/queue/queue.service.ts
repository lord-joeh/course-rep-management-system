import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { QueueName, EmailJobType, DriveJobType, AttendanceJobType } from './constants';
import {
  EmailJobData,
  SmsJobData,
  DriveJobData,
  DriveUploadJobData,
  DriveDeleteJobData,
  AttendanceRosterJobData,
} from './dto';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QueueName.EMAIL) private readonly emailQueue: Queue<EmailJobData>,
    @InjectQueue(QueueName.SMS) private readonly smsQueue: Queue<SmsJobData>,
    @InjectQueue(QueueName.DRIVE_SYNC) private readonly driveSyncQueue: Queue<DriveJobData>,
    @InjectQueue(QueueName.ATTENDANCE) private readonly attendanceQueue: Queue<AttendanceRosterJobData>,
  ) {}

  /**
   * Enqueue a transactional or batch email job
   */
  async sendEmail(
    jobType: EmailJobType,
    payload: Omit<EmailJobData, 'jobType'>,
    options?: JobsOptions,
  ): Promise<string> {
    const jobData: EmailJobData = { ...payload, jobType };
    const defaultOptions: JobsOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      ...options,
    };

    const job = await this.emailQueue.add(jobType, jobData, defaultOptions);
    this.logger.log(`Enqueued email job [${job.id}] type [${jobType}] for [${payload.to}]`);
    return job.id ? String(job.id) : '';
  }

  /**
   * Enqueue an urgent SMS alert
   */
  async sendSms(
    to: string,
    message: string,
    options?: JobsOptions,
    meta?: { userId?: string; socketId?: string },
  ): Promise<string> {
    const jobData: SmsJobData = {
      to,
      message,
      userId: meta?.userId,
      socketId: meta?.socketId,
    };
    const defaultOptions: JobsOptions = {
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      ...options,
    };

    const job = await this.smsQueue.add('send-sms', jobData, defaultOptions);
    this.logger.log(`Enqueued SMS job [${job.id}] for recipient [${to}]`);
    return job.id ? String(job.id) : '';
  }

  /**
   * Enqueue a Google Drive background file upload
   */
  async uploadToDrive(
    data: Omit<DriveUploadJobData, 'type'>,
    options?: JobsOptions,
  ): Promise<string> {
    const jobData: DriveUploadJobData = {
      ...data,
      type: DriveJobType.UPLOAD_SLIDE_FILE,
    };
    const defaultOptions: JobsOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      ...options,
    };

    const job = await this.driveSyncQueue.add('upload-drive-file', jobData, defaultOptions);
    this.logger.log(`Enqueued Drive upload job [${job.id}] for file [${data.fileName}]`);
    return job.id ? String(job.id) : '';
  }

  /**
   * Enqueue a Google Drive file purge
   */
  async deleteFromDrive(
    driveFileId: string,
    options?: JobsOptions,
    meta?: { slideId?: string; assignmentId?: string },
  ): Promise<string> {
    const jobData: DriveDeleteJobData = {
      type: DriveJobType.DELETE_DRIVE_FILE,
      driveFileId,
      slideId: meta?.slideId,
      assignmentId: meta?.assignmentId,
    };
    const defaultOptions: JobsOptions = {
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      ...options,
    };

    const job = await this.driveSyncQueue.add('delete-drive-file', jobData, defaultOptions);
    this.logger.log(`Enqueued Drive delete job [${job.id}] for drive file [${driveFileId}]`);
    return job.id ? String(job.id) : '';
  }

  /**
   * Enqueue attendance roster batch initialization
   */
  async initializeAttendanceRoster(
    sessionId: string,
    courseId: string,
    date: string,
    options?: JobsOptions,
  ): Promise<string> {
    const jobData: AttendanceRosterJobData = {
      type: AttendanceJobType.INITIALIZE_ROSTER,
      sessionId,
      courseId,
      date,
    };
    const defaultOptions: JobsOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
      ...options,
    };

    const job = await this.attendanceQueue.add('initialize-roster', jobData, defaultOptions);
    this.logger.log(`Enqueued Attendance roster job [${job.id}] for session [${sessionId}]`);
    return job.id ? String(job.id) : '';
  }

  /**
   * Retrieve real-time operational queue statistics
   */
  async getQueueStats(): Promise<Record<string, any>> {
    const [emailCounts, smsCounts, driveCounts, attendanceCounts] = await Promise.all([
      this.emailQueue.getJobCounts(),
      this.smsQueue.getJobCounts(),
      this.driveSyncQueue.getJobCounts(),
      this.attendanceQueue.getJobCounts(),
    ]);

    return {
      [QueueName.EMAIL]: emailCounts,
      [QueueName.SMS]: smsCounts,
      [QueueName.DRIVE_SYNC]: driveCounts,
      [QueueName.ATTENDANCE]: attendanceCounts,
    };
  }
}

