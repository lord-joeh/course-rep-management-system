import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AppleOAuthService } from './apple-oauth.service';

describe('AppleOAuthService', () => {
  let service: AppleOAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppleOAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'APPLE_CLIENT_ID') return 'com.courserep.app';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AppleOAuthService>(AppleOAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyIdentityToken', () => {
    it('should throw UnauthorizedException if token is empty', async () => {
      await expect(service.verifyIdentityToken('')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should return mock profile in test mode when using mock-apple-token prefix', async () => {
      const result = await service.verifyIdentityToken('mock-apple-token-abc');
      expect(result).toEqual({
        sub: 'mock-apple-sub-98765',
        email: 'mock.apple.student@privaterelay.appleid.com',
        emailVerified: true,
      });
    });

    it('should throw UnauthorizedException when token does not have 3 parts', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await expect(service.verifyIdentityToken('malformed.token')).rejects.toThrow(
        'Malformed Apple identity token',
      );

      process.env.NODE_ENV = origEnv;
    });

    it('should throw UnauthorizedException when token is expired', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'kid-1' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://appleid.apple.com',
          aud: 'com.courserep.app',
          sub: 'apple-user-1',
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        }),
      ).toString('base64url');
      const token = `${header}.${payload}.mockSignature`;

      await expect(service.verifyIdentityToken(token)).rejects.toThrow(
        'Apple sign-in token has expired',
      );

      process.env.NODE_ENV = origEnv;
    });

    it('should throw UnauthorizedException when token issuer is invalid', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'kid-1' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          iss: 'https://fake-issuer.com',
          aud: 'com.courserep.app',
          sub: 'apple-user-1',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      const token = `${header}.${payload}.mockSignature`;

      await expect(service.verifyIdentityToken(token)).rejects.toThrow(
        'Invalid Apple token issuer',
      );

      process.env.NODE_ENV = origEnv;
    });
  });
});

