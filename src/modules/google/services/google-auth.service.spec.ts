import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { google } from 'googleapis';

import { GoogleAuthService } from './google-auth.service';
import { GoogleToken } from '../entities/google-token.entity';
import { EncryptionService } from './encryption.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL } from '../../../common/constants/cache.constants';

describe('GoogleAuthService', () => {
  let service: GoogleAuthService;
  let googleTokenRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let encryptionServiceMock: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
  };
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };

  const mockOAuthClientInstance = {
    generateAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=mockState'),
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn(),
    revokeCredentials: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    googleTokenRepoMock = {
      findOne: jest.fn(),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    encryptionServiceMock = {
      encrypt: jest.fn((text: string) => `enc_${text}`),
      decrypt: jest.fn((cipher: string) => cipher.replace(/^enc_/, '')),
    };

    cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(true),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'mock_client_id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'mock_client_secret';
        if (key === 'GOOGLE_REDIRECT_URI') return 'http://localhost:5000/api/google/callback';
        if (key === 'USER_ID') return 'system_default_rep';
        return null;
      }),
    };

    jest.spyOn(google.auth, 'OAuth2').mockImplementation(() => mockOAuthClientInstance as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: getRepositoryToken(GoogleToken),
          useValue: googleTokenRepoMock,
        },
        {
          provide: EncryptionService,
          useValue: encryptionServiceMock,
        },
        {
          provide: ConfigService,
          useValue: configServiceMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
      ],
    }).compile();

    service = module.get<GoogleAuthService>(GoogleAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize fallback configuration when ConfigService returns null', async () => {
    const fallbackConfigModule = await Test.createTestingModule({
      providers: [
        GoogleAuthService,
        {
          provide: getRepositoryToken(GoogleToken),
          useValue: googleTokenRepoMock,
        },
        {
          provide: EncryptionService,
          useValue: encryptionServiceMock,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) },
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
      ],
    }).compile();

    const fallbackService = fallbackConfigModule.get<GoogleAuthService>(GoogleAuthService);
    expect(fallbackService).toBeDefined();
  });

  describe('generateAuthUrl', () => {
    it('should generate an OAuth2 url, store state in redis with 15min TTL, and return both', async () => {
      const repId = 'rep_user_123';
      const result = await service.generateAuthUrl(repId);

      expect(result).toBeDefined();
      expect(result.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=mockState');
      expect(typeof result.state).toBe('string');
      expect(result.state).toHaveLength(64);

      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        `cr:google:oauth:state:${result.state}`,
        expect.objectContaining({ repId, createdAt: expect.any(Number) }),
        CACHE_TTL.FIFTEEN_MINUTES,
      );
    });
  });

  describe('handleCallback', () => {
    it('should throw BadRequestException if state is missing', async () => {
      await expect(service.handleCallback('code123', '')).rejects.toThrow(
        new BadRequestException('State parameter is missing'),
      );
    });

    it('should throw BadRequestException if state is not found in redis', async () => {
      cacheServiceMock.get.mockResolvedValue(null);

      await expect(service.handleCallback('code123', 'invalid_state')).rejects.toThrow(
        BadRequestException,
      );
      expect(cacheServiceMock.get).toHaveBeenCalledWith('cr:google:oauth:state:invalid_state');
    });

    it('should throw BadRequestException if token exchange fails', async () => {
      cacheServiceMock.get.mockResolvedValue({ repId: 'rep123' });
      mockOAuthClientInstance.getToken.mockRejectedValue(new Error('Invalid grant'));

      await expect(service.handleCallback('code123', 'valid_state')).rejects.toThrow(
        BadRequestException,
      );
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:google:oauth:state:valid_state');
    });

    it('should exchange code, encrypt secrets, update existing record, and invalidate status cache', async () => {
      cacheServiceMock.get.mockResolvedValue({ repId: 'rep123' });
      mockOAuthClientInstance.getToken.mockResolvedValue({
        tokens: {
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          expiry_date: 1800000000000,
        },
      });

      const existingRecord = {
        userId: 'system_default_rep',
        clientId: 'old_client_id',
        clientSecret: 'enc_old_secret',
        refreshToken: 'enc_old_refresh',
        accessToken: null,
        expiryDate: null,
        updatedAt: new Date(0),
      };
      googleTokenRepoMock.findOne.mockResolvedValue(existingRecord);

      const result = await service.handleCallback('valid_code', 'valid_state');

      expect(result).toEqual({
        message: 'Google account connected successfully',
        connected: true,
      });

      expect(encryptionServiceMock.encrypt).toHaveBeenCalledWith('mock_client_secret');
      expect(encryptionServiceMock.encrypt).toHaveBeenCalledWith('new_refresh_token');
      expect(encryptionServiceMock.encrypt).toHaveBeenCalledWith('new_access_token');

      expect(googleTokenRepoMock.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system_default_rep',
          clientId: 'mock_client_id',
          clientSecret: 'enc_mock_client_secret',
          refreshToken: 'enc_new_refresh_token',
          accessToken: 'enc_new_access_token',
          expiryDate: 1800000000000,
        }),
      );
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:google:status');
    });

    it('should exchange code and create new record when none exists', async () => {
      cacheServiceMock.get.mockResolvedValue({ repId: 'rep123' });
      mockOAuthClientInstance.getToken.mockResolvedValue({
        tokens: {
          access_token: 'fresh_access',
          refresh_token: 'fresh_refresh',
          expiry_date: null,
        },
      });
      googleTokenRepoMock.findOne.mockResolvedValue(null);

      const result = await service.handleCallback('code456', 'valid_state_2');

      expect(result.connected).toBe(true);
      expect(googleTokenRepoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system_default_rep',
          type: 'authorized_user',
          clientId: 'mock_client_id',
          clientSecret: 'enc_mock_client_secret',
          refreshToken: 'enc_fresh_refresh',
          accessToken: 'enc_fresh_access',
          expiryDate: null,
        }),
      );
      expect(googleTokenRepoMock.save).toHaveBeenCalled();
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:google:status');
    });

    it('should handle optional tokens (no refresh_token, no access_token) cleanly', async () => {
      cacheServiceMock.get.mockResolvedValue({ repId: 'rep123' });
      mockOAuthClientInstance.getToken.mockResolvedValue({
        tokens: {
          access_token: undefined,
          refresh_token: undefined,
          expiry_date: undefined,
        },
      });

      const existingRecord = {
        userId: 'system_default_rep',
        refreshToken: 'enc_existing_refresh',
      };
      googleTokenRepoMock.findOne.mockResolvedValue(existingRecord);

      const result = await service.handleCallback('code789', 'valid_state_3');
      expect(result.connected).toBe(true);
      expect(googleTokenRepoMock.save).toHaveBeenCalled();
    });
  });

  describe('getAuthorizedClient', () => {
    it('should throw UnauthorizedException if no token record found', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue(null);

      await expect(service.getAuthorizedClient()).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if record has no refreshToken', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        refreshToken: null,
      });

      await expect(service.getAuthorizedClient()).rejects.toThrow(UnauthorizedException);
    });

    it('should return configured OAuth2Client when token is valid and not expiring', async () => {
      const futureExpiry = Date.now() + 3600000;
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_my_secret',
        refreshToken: 'enc_my_refresh',
        accessToken: 'enc_my_access',
        expiryDate: futureExpiry,
      });

      const client = await service.getAuthorizedClient();

      expect(client).toBeDefined();
      expect(encryptionServiceMock.decrypt).toHaveBeenCalledWith('enc_my_secret');
      expect(encryptionServiceMock.decrypt).toHaveBeenCalledWith('enc_my_refresh');
      expect(encryptionServiceMock.decrypt).toHaveBeenCalledWith('enc_my_access');

      expect(mockOAuthClientInstance.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'my_refresh',
        access_token: 'my_access',
        expiry_date: futureExpiry,
      });
      expect(mockOAuthClientInstance.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should auto-refresh expiring token if within 60 seconds of expiry', async () => {
      const expiringSoon = Date.now() + 30000; // 30s remaining (< 60s)
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_secret',
        refreshToken: 'enc_refresh',
        accessToken: 'enc_access',
        expiryDate: expiringSoon,
      });

      mockOAuthClientInstance.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'brand_new_access_token',
          expiry_date: Date.now() + 3600000,
        },
      });

      const client = await service.getAuthorizedClient();

      expect(client).toBeDefined();
      expect(mockOAuthClientInstance.refreshAccessToken).toHaveBeenCalled();
      expect(googleTokenRepoMock.update).toHaveBeenCalledWith(
        'system_default_rep',
        expect.objectContaining({
          accessToken: 'enc_brand_new_access_token',
          expiryDate: expect.any(Number),
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('should catch and log error if auto-refresh fails without throwing', async () => {
      const expired = Date.now() - 10000;
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_secret',
        refreshToken: 'enc_refresh',
        accessToken: null,
        expiryDate: expired,
      });

      mockOAuthClientInstance.refreshAccessToken.mockRejectedValue(new Error('Network error'));

      const client = await service.getAuthorizedClient();
      expect(client).toBeDefined();
    });

    it('should not refresh token if record has no expiryDate', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_secret',
        refreshToken: 'enc_refresh',
        accessToken: 'enc_access',
        expiryDate: null,
      });

      const client = await service.getAuthorizedClient();
      expect(client).toBeDefined();
      expect(mockOAuthClientInstance.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should auto-refresh expiring token with null access_token and expiry_date if credentials omits them', async () => {
      const expiringSoon = Date.now() + 30000;
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_secret',
        refreshToken: 'enc_refresh',
        accessToken: 'enc_access',
        expiryDate: expiringSoon,
      });

      mockOAuthClientInstance.refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: undefined,
          expiry_date: undefined,
        },
      });

      const client = await service.getAuthorizedClient();
      expect(client).toBeDefined();
      expect(googleTokenRepoMock.update).toHaveBeenCalledWith(
        'system_default_rep',
        expect.objectContaining({
          accessToken: null,
          expiryDate: null,
        }),
      );
    });
  });

  describe('revokeAccess', () => {
    it('should revoke credentials from Google API and delete token record from db', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_secret',
        refreshToken: 'enc_refresh',
        accessToken: 'enc_access',
        expiryDate: Date.now() + 3600000,
      });

      const result = await service.revokeAccess();

      expect(result).toEqual({ message: 'Google account disconnected successfully' });
      expect(mockOAuthClientInstance.revokeCredentials).toHaveBeenCalled();
      expect(googleTokenRepoMock.delete).toHaveBeenCalledWith({ userId: 'system_default_rep' });
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:google:status');
    });

    it('should delete token record even if Google API revoke throws error', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        clientId: 'mock_client_id',
        clientSecret: 'enc_secret',
        refreshToken: 'enc_refresh',
      });
      mockOAuthClientInstance.revokeCredentials.mockRejectedValue(new Error('Token already revoked'));

      const result = await service.revokeAccess();

      expect(result).toEqual({ message: 'Google account disconnected successfully' });
      expect(googleTokenRepoMock.delete).toHaveBeenCalledWith({ userId: 'system_default_rep' });
      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:google:status');
    });
  });

  describe('getStatus', () => {
    it('should return connected false when no token record exists', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue(null);

      const status = await service.getStatus();
      expect(status).toEqual({ connected: false, expiryDate: null });
    });

    it('should return connected false when record has no refreshToken', async () => {
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        refreshToken: null,
        expiryDate: null,
      });

      const status = await service.getStatus();
      expect(status).toEqual({ connected: false, expiryDate: null });
    });

    it('should return connected true with expiryDate when valid record exists', async () => {
      const expiry = Date.now() + 3600000;
      googleTokenRepoMock.findOne.mockResolvedValue({
        userId: 'system_default_rep',
        refreshToken: 'enc_refresh',
        expiryDate: expiry,
      });

      const status = await service.getStatus();
      expect(status).toEqual({ connected: true, expiryDate: expiry });
    });
  });
});

