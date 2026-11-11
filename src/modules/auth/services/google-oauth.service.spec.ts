import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { GoogleOAuthService } from './google-oauth.service';
import { google } from 'googleapis';

jest.mock('googleapis', () => {
  const mOAuth2 = {
    verifyIdToken: jest.fn(),
  };
  return {
    google: {
      auth: {
        OAuth2: jest.fn(() => mOAuth2),
      },
    },
  };
});

describe('GoogleOAuthService', () => {
  let service: GoogleOAuthService;
  let mockOAuth2Instance: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOAuth2Instance = new google.auth.OAuth2();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'GOOGLE_CLIENT_ID') return 'test-google-client-id';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<GoogleOAuthService>(GoogleOAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyIdToken', () => {
    it('should throw UnauthorizedException if idToken is empty', async () => {
      await expect(service.verifyIdToken('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return mock profile in test mode when using mock-google-token prefix', async () => {
      const result = await service.verifyIdToken('mock-google-token-xyz');
      expect(result).toEqual({
        sub: 'mock-google-sub-12345',
        email: 'test.oauth.student@university.edu',
        name: 'Mock OAuth Student',
        picture: 'https://lh3.googleusercontent.com/mock-avatar.png',
        emailVerified: true,
      });
    });

    it('should verify live Google ID token and return normalized payload', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockOAuth2Instance.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-777',
          email: 'Student@Uni.EDU ',
          name: 'Kwame Mensah',
          picture: 'https://lh3.googleusercontent.com/avatar.jpg',
          email_verified: true,
        }),
      });

      const result = await service.verifyIdToken('real-live-google-token');

      expect(mockOAuth2Instance.verifyIdToken).toHaveBeenCalledWith({
        idToken: 'real-live-google-token',
        audience: 'test-google-client-id',
      });
      expect(result).toEqual({
        sub: 'google-sub-777',
        email: 'student@uni.edu',
        name: 'Kwame Mensah',
        picture: 'https://lh3.googleusercontent.com/avatar.jpg',
        emailVerified: true,
      });

      process.env.NODE_ENV = origEnv;
    });

    it('should throw UnauthorizedException when Google returns missing email', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockOAuth2Instance.verifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: 'google-sub-777',
          name: 'Kwame Mensah',
        }),
      });

      await expect(
        service.verifyIdToken('token-missing-email'),
      ).rejects.toThrow(UnauthorizedException);

      process.env.NODE_ENV = origEnv;
    });

    it('should throw expired message when Google token has expired', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      mockOAuth2Instance.verifyIdToken.mockRejectedValue(
        new Error('Token used too late, expired 1000ms ago'),
      );

      await expect(service.verifyIdToken('expired-token')).rejects.toThrow(
        'Google sign-in token has expired',
      );

      process.env.NODE_ENV = origEnv;
    });
  });
});

