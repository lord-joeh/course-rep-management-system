import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FirebaseMessagingService } from './firebase-messaging.service';

// Mock firebase-admin/app and firebase-admin/messaging
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn().mockReturnValue({ name: '[DEFAULT]' }),
  getApps: jest.fn().mockReturnValue([]),
  getApp: jest.fn().mockReturnValue({ name: '[DEFAULT]' }),
  cert: jest.fn().mockReturnValue({}),
}));

const mockMessaging = {
  send: jest.fn(),
  sendEachForMulticast: jest.fn(),
};

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(() => mockMessaging),
}));

describe('FirebaseMessagingService', () => {
  let service: FirebaseMessagingService;
  let configServiceMock: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'FIREBASE_PROJECT_ID') return 'test-project';
        if (key === 'FIREBASE_CLIENT_EMAIL') return 'test@firebase.local';
        if (key === 'FIREBASE_PRIVATE_KEY')
          return '-----BEGIN PRIVATE KEY-----\\nMIIEvgIBADANBgk...\\n-----END PRIVATE KEY-----';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirebaseMessagingService,
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
      ],
    }).compile();

    service = module.get<FirebaseMessagingService>(FirebaseMessagingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize successfully when credentials are provided', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should fallback to mock mode when credentials are missing', async () => {
      configServiceMock.get.mockReturnValue(null);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FirebaseMessagingService,
          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();

      const mockService = module.get<FirebaseMessagingService>(
        FirebaseMessagingService,
      );
      expect(mockService.isReady()).toBe(false);
    });

    it('should handle already initialized apps gracefully', async () => {
      const { getApps } = jest.requireMock('firebase-admin/app');
      getApps.mockReturnValue([{ name: '[DEFAULT]' }]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FirebaseMessagingService,
          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();

      const existingAppService = module.get<FirebaseMessagingService>(
        FirebaseMessagingService,
      );
      expect(existingAppService.isReady()).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      const { initializeApp, getApps } = jest.requireMock('firebase-admin/app');
      getApps.mockReturnValue([]);
      initializeApp.mockImplementationOnce(() => {
        throw new Error('Cert parse failed');
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FirebaseMessagingService,
          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();

      const errorService = module.get<FirebaseMessagingService>(
        FirebaseMessagingService,
      );
      expect(errorService.isReady()).toBe(false);
    });
  });

  describe('sendToToken', () => {
    it('should return null if token is empty', async () => {
      const result = await service.sendToToken('', {
        title: 'Title',
        body: 'Body',
      });
      expect(result).toBeNull();
    });

    it('should return mock message id when unconfigured', async () => {
      configServiceMock.get.mockReturnValue(null);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FirebaseMessagingService,
          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();
      const mockService = module.get<FirebaseMessagingService>(
        FirebaseMessagingService,
      );

      const result = await mockService.sendToToken('dummy-token-123456789', {
        title: 'Mock Title',
        body: 'Mock Body',
      });
      expect(result).toBe('mock-message-id');
    });

    it('should send push notification when configured', async () => {
      mockMessaging.send.mockResolvedValue('fcm-message-id-999');

      const result = await service.sendToToken('fcm-device-token', {
        title: 'Exam Rescheduled',
        body: 'CSC 301 is now on Friday',
        data: { courseId: 'csc-301' },
      });

      expect(result).toBe('fcm-message-id-999');
      expect(mockMessaging.send).toHaveBeenCalledWith({
        token: 'fcm-device-token',
        notification: {
          title: 'Exam Rescheduled',
          body: 'CSC 301 is now on Friday',
        },
        data: { courseId: 'csc-301' },
      });
    });

    it('should catch and handle send error gracefully', async () => {
      mockMessaging.send.mockRejectedValue(new Error('Network timeout'));

      const result = await service.sendToToken('fcm-device-token', {
        title: 'Title',
        body: 'Body',
      });

      expect(result).toBeNull();
    });
  });

  describe('sendMulticast', () => {
    it('should return zero counts when tokens array is empty', async () => {
      const result = await service.sendMulticast([], {
        title: 'Title',
        body: 'Body',
      });
      expect(result).toEqual({
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      });
    });

    it('should return mock multicast result when unconfigured', async () => {
      configServiceMock.get.mockReturnValue(null);
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FirebaseMessagingService,
          {
            provide: ConfigService,
            useValue: configServiceMock,
          },
        ],
      }).compile();
      const mockService = module.get<FirebaseMessagingService>(
        FirebaseMessagingService,
      );

      const result = await mockService.sendMulticast(['token-1', 'token-2'], {
        title: 'Mock Broadcast',
        body: 'Mock Message',
      });

      expect(result).toEqual({
        successCount: 2,
        failureCount: 0,
        invalidTokens: [],
      });
    });

    it('should send multicast and identify invalid tokens', async () => {
      mockMessaging.sendEachForMulticast.mockResolvedValue({
        successCount: 2,
        failureCount: 1,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/invalid-registration-token' },
          },
          { success: true },
        ],
      });

      const tokens = ['valid-1', 'invalid-token', 'valid-2'];
      const result = await service.sendMulticast(tokens, {
        title: 'General Meeting',
        body: 'Hall 3 at 4pm',
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.invalidTokens).toEqual(['invalid-token']);
    });

    it('should identify unregistered tokens as invalid', async () => {
      mockMessaging.sendEachForMulticast.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
          { success: true },
        ],
      });

      const tokens = ['stale-token', 'valid-token'];
      const result = await service.sendMulticast(tokens, {
        title: 'Title',
        body: 'Body',
      });

      expect(result.invalidTokens).toEqual(['stale-token']);
    });

    it('should catch and handle multicast dispatch failure gracefully', async () => {
      mockMessaging.sendEachForMulticast.mockRejectedValue(
        new Error('Google API quota exceeded'),
      );

      const tokens = ['token-1', 'token-2'];
      const result = await service.sendMulticast(tokens, {
        title: 'Title',
        body: 'Body',
      });

      expect(result).toEqual({
        successCount: 0,
        failureCount: 2,
        invalidTokens: [],
      });
    });
  });
});
