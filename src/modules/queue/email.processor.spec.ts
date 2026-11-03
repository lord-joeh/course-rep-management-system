import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { EmailProcessor } from './processors/email.processor';
import { EmailJobType } from './constants';
import { EmailJobData } from './dto';

jest.mock('nodemailer');

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let configService: ConfigService;
  let mockSendMail: jest.Mock;

  beforeEach(async () => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'mock-mail-id-123' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const configs: Record<string, any> = {
                SMTP_HOST: 'smtp.test.com',
                SMTP_PORT: 587,
                SMTP_USER: 'test@test.com',
                SMTP_PASS: 'testpass',
                SMTP_FROM: 'Course Rep <noreply@courserep.com>',
                FRONTEND_URL: 'http://localhost:3000',
              };
              return configs[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should process REGISTRATION_SUCCESS email with sanitization', async () => {
    const job = {
      id: 'job-1',
      data: {
        jobType: EmailJobType.REGISTRATION_SUCCESS,
        to: 'student@uni.edu',
        name: 'John <script>alert(1)</script>Doe',
        studentId: 'STD-100<style>bad</style>',
      },
    } as unknown as Job<EmailJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('mock-mail-id-123');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@uni.edu',
        subject: 'Welcome to Course Rep Management System',
        html: expect.not.stringContaining('<script>'),
      }),
    );
    expect(mockSendMail.mock.calls[0][0].html).toContain('John Doe');
  });

  it('should process PASSWORD_RESET email', async () => {
    const job = {
      id: 'job-2',
      data: {
        jobType: EmailJobType.PASSWORD_RESET,
        to: 'student@uni.edu',
        name: 'Alice',
        resetToken: 'secure-token-abc-123',
      },
    } as unknown as Job<EmailJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@uni.edu',
        subject: 'Password Reset Request',
        html: expect.stringContaining('token=secure-token-abc-123'),
      }),
    );
  });

  it('should process PASSWORD_CHANGED email', async () => {
    const job = {
      id: 'job-3',
      data: {
        jobType: EmailJobType.PASSWORD_CHANGED,
        to: 'student@uni.edu',
        name: 'Bob',
      },
    } as unknown as Job<EmailJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@uni.edu',
        subject: 'Password Changed Confirmation',
        html: expect.stringContaining('Bob'),
      }),
    );
  });

  it('should process GROUP_ASSIGNMENT email', async () => {
    const job = {
      id: 'job-4',
      data: {
        jobType: EmailJobType.GROUP_ASSIGNMENT,
        to: 'member@uni.edu',
        name: 'Charlie',
        groupName: 'Group Alpha',
        groupMembers: [
          { id: '1', name: 'Leader Bob', email: 'bob@uni.edu' },
          { id: '2', name: 'Charlie', email: 'charlie@uni.edu' },
        ],
      },
    } as unknown as Job<EmailJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@uni.edu',
        subject: 'Academic Group Assigned: Group Alpha',
        html: expect.stringContaining('Leader Bob'),
      }),
    );
  });

  it('should process FEEDBACK_RECEIVED email', async () => {
    const job = {
      id: 'job-5',
      data: {
        jobType: EmailJobType.FEEDBACK_RECEIVED,
        to: 'student@uni.edu',
        name: 'Diana',
      },
    } as unknown as Job<EmailJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@uni.edu',
        subject: "We've Received Your Feedback - Course Rep Team",
        html: expect.stringContaining('Diana'),
      }),
    );
  });

  it('should process STUDENT_MESSAGE email', async () => {
    const job = {
      id: 'job-6',
      data: {
        jobType: EmailJobType.STUDENT_MESSAGE,
        to: 'student@uni.edu',
        name: 'Edward',
        message: 'Reminder: lecture moved to room 402',
        subject: 'Urgent Room Change',
      },
    } as unknown as Job<EmailJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'student@uni.edu',
        subject: 'Urgent Room Change',
        html: expect.stringContaining('Reminder: lecture moved to room 402'),
      }),
    );
  });

  it('should throw an error for unsupported email job type', async () => {
    const job = {
      id: 'job-err',
      data: {
        jobType: 'unsupported-job' as any,
        to: 'student@uni.edu',
      },
    } as unknown as Job<EmailJobData>;

    await expect(processor.process(job)).rejects.toThrow('Unsupported email job type: unsupported-job');
  });

  it('should rethrow error when sendMail fails', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection timeout'));

    const job = {
      id: 'job-fail',
      data: {
        jobType: EmailJobType.REGISTRATION_SUCCESS,
        to: 'student@uni.edu',
      },
    } as unknown as Job<EmailJobData>;

    await expect(processor.process(job)).rejects.toThrow('SMTP connection timeout');
  });
});

