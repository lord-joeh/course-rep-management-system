import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { SmsProcessor } from './processors/sms.processor';
import { SmsJobData } from './dto';

describe('SmsProcessor', () => {
  let processor: SmsProcessor;
  let configService: ConfigService;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const configs: Record<string, any> = {
                ARKESEL_API_KEY: 'test-arkesel-key-xyz',
                ARKESEL_SENDER_ID: 'CourseRep',
                ARKESEL_BASE_URL: 'https://sms.arkesel.com/api/v2/sms/send',
              };
              return configs[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    processor = module.get<SmsProcessor>(SmsProcessor);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should successfully dispatch SMS using HTTP POST with api-key header for V2 endpoint', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        data: [{ recipient: '233241234567', id: 'sms-msg-1' }],
      }),
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const job = {
      id: 'sms-job-1',
      data: {
        to: '0241234567',
        message: 'Midsem exams begin on Monday at 9AM in Hall B.',
        userId: 'student-123',
      },
    } as unknown as Job<SmsJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://sms.arkesel.com/api/v2/sms/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'api-key': 'test-arkesel-key-xyz',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          sender: 'CourseRep',
          message: 'Midsem exams begin on Monday at 9AM in Hall B.',
          recipients: ['233241234567'],
        }),
      }),
    );
  });

  it('should dispatch SMS using HTTP GET for Arkesel V1 legacy endpoint', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'ARKESEL_API_KEY') return 'test-key';
      if (key === 'ARKESEL_SENDER_ID') return 'CourseRep';
      if (key === 'ARKESEL_BASE_URL') return 'https://sms.arkesel.com/sms/api?action=send-sms&';
      return null;
    });

    const mockResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        code: 'ok',
        message: 'Successfully Sent',
        balance: 500,
      }),
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const job = {
      id: 'sms-job-v1',
      data: {
        to: '0256269405',
        message: 'Hello Student',
        userId: 'student-456',
      },
    } as unknown as Job<SmsJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('https://sms.arkesel.com/sms/api?action=send-sms'),
      expect.objectContaining({
        method: 'GET',
      }),
    );
  });

  it('should fallback to V1 GET if V2 POST returns 405 Method Not Supported', async () => {
    const post405Response = {
      ok: false,
      status: 405,
      json: jest.fn().mockResolvedValue({
        message: 'The POST method is not supported for this route. Supported methods: GET, HEAD.',
      }),
    };

    const getV1Response = {
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        code: 'ok',
        message: 'Successfully Sent',
      }),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(post405Response)
      .mockResolvedValueOnce(getV1Response);

    const job = {
      id: 'sms-job-fallback',
      data: {
        to: '0256269405',
        message: 'Fallback test message',
      },
    } as unknown as Job<SmsJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('https://sms.arkesel.com/sms/api?action=send-sms'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should run in mock mode when ARKESEL_API_KEY is not configured', async () => {
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      if (key === 'ARKESEL_API_KEY') return null;
      return null;
    });

    const job = {
      id: 'sms-job-mock',
      data: {
        to: '233555000111',
        message: 'Mock SMS test',
      },
    } as unknown as Job<SmsJobData>;

    const result = await processor.process(job);

    expect(result.success).toBe(true);
    expect(result.mocked).toBe(true);
    expect(result.to).toBe('233555000111');
  });

  it('should throw an error when Arkesel API returns error status', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({
        status: 'error',
        message: 'Insufficient balance in Arkesel account',
      }),
    };
    global.fetch = jest.fn().mockResolvedValue(mockResponse);

    const job = {
      id: 'sms-job-err',
      data: {
        to: '0501234567',
        message: 'Error test',
      },
    } as unknown as Job<SmsJobData>;

    await expect(processor.process(job)).rejects.toThrow('Insufficient balance in Arkesel account');
  });
});
