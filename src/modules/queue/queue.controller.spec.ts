import { Test, TestingModule } from '@nestjs/testing';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { EmailJobType } from './constants';

describe('QueueController', () => {
  let controller: QueueController;
  let queueService: QueueService;

  const mockQueueService = {
    getQueueStats: jest.fn().mockResolvedValue({
      'email-queue': { active: 1, waiting: 0 },
    }),
    sendEmail: jest.fn().mockResolvedValue('test-mail-job-id'),
    sendSms: jest.fn().mockResolvedValue('test-sms-job-id'),
  };

  const mockRepUser = {
    id: 'rep-uuid-1',
    sub: 'rep-uuid-1',
    name: 'Course Representative',
    email: 'rep@student.edu',
    phone: '0241112233',
    isRep: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        {
          provide: QueueService,
          useValue: mockQueueService,
        },
      ],
    }).compile();

    controller = module.get<QueueController>(QueueController);
    queueService = module.get<QueueService>(QueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return queue statistics', async () => {
    const result = await controller.getStats();

    expect(result.message).toBe('Queue operational metrics retrieved successfully');
    expect(result.stats).toEqual({
      'email-queue': { active: 1, waiting: 0 },
    });
    expect(mockQueueService.getQueueStats).toHaveBeenCalled();
  });

  it('should enqueue test email with provided custom email address', async () => {
    const result = await controller.sendTestEmail(mockRepUser, 'custom@test.com');

    expect(result.message).toBe('Test email job successfully enqueued');
    expect(result.jobId).toBe('test-mail-job-id');
    expect(result.recipient).toBe('custom@test.com');
    expect(mockQueueService.sendEmail).toHaveBeenCalledWith(
      EmailJobType.STUDENT_MESSAGE,
      expect.objectContaining({
        to: 'custom@test.com',
        name: 'Course Representative',
      }),
    );
  });

  it('should default to authenticated user email when custom email is omitted', async () => {
    const result = await controller.sendTestEmail(mockRepUser);

    expect(result.recipient).toBe('rep@student.edu');
    expect(mockQueueService.sendEmail).toHaveBeenCalledWith(
      EmailJobType.STUDENT_MESSAGE,
      expect.objectContaining({
        to: 'rep@student.edu',
      }),
    );
  });

  it('should enqueue test SMS with custom message', async () => {
    const result = await controller.sendTestSms(
      mockRepUser,
      '0249998877',
      'Custom alert testing queue',
    );

    expect(result.message).toBe('Test SMS job successfully enqueued');
    expect(result.jobId).toBe('test-sms-job-id');
    expect(result.recipient).toBe('0249998877');
    expect(mockQueueService.sendSms).toHaveBeenCalledWith(
      '0249998877',
      'Custom alert testing queue',
      undefined,
      { userId: 'rep-uuid-1' },
    );
  });

  it('should default to user phone and default message when omitted', async () => {
    const result = await controller.sendTestSms(mockRepUser, '');

    expect(result.recipient).toBe('0241112233');
    expect(mockQueueService.sendSms).toHaveBeenCalledWith(
      '0241112233',
      'Course Rep System: Background queue SMS pipeline test.',
      undefined,
      { userId: 'rep-uuid-1' },
    );
  });
});

