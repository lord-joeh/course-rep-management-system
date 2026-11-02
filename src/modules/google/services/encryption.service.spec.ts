import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'ENCRYPTION_KEY') return 'test_super_secret_encryption_key_32bytes!';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('constructor fallbacks', () => {
    it('should initialize using JWT_ACCESS_SECRET if ENCRYPTION_KEY is absent', async () => {
      const fallbackModule: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'JWT_ACCESS_SECRET') return 'jwt_access_fallback_secret';
                return null;
              }),
            },
          },
        ],
      }).compile();

      const fallbackService = fallbackModule.get<EncryptionService>(EncryptionService);
      expect(fallbackService).toBeDefined();
      const encrypted = fallbackService.encrypt('hello fallback');
      expect(fallbackService.decrypt(encrypted)).toBe('hello fallback');
    });

    it('should initialize using default fallback key if all configs are absent', async () => {
      const defaultModule: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => null),
            },
          },
        ],
      }).compile();

      const defaultService = defaultModule.get<EncryptionService>(EncryptionService);
      expect(defaultService).toBeDefined();
      const encrypted = defaultService.encrypt('default secret text');
      expect(defaultService.decrypt(encrypted)).toBe('default secret text');
    });
  });

  describe('encrypt and decrypt', () => {
    it('should return falsy/empty string if plainText is falsy', () => {
      expect(service.encrypt('')).toBe('');
      expect(service.encrypt(null as any)).toBe(null);
    });

    it('should return falsy/empty string if cipherPayload is falsy', () => {
      expect(service.decrypt('')).toBe('');
      expect(service.decrypt(null as any)).toBe(null);
    });

    it('should encrypt and decrypt a string accurately (round-trip)', () => {
      const original = 'google_refresh_token_xyz_1234567890';
      const cipherPayload = service.encrypt(original);

      expect(typeof cipherPayload).toBe('string');
      const parts = cipherPayload.split(':');
      expect(parts.length).toBe(3); // iv:tag:ciphertext

      const decrypted = service.decrypt(cipherPayload);
      expect(decrypted).toBe(original);
    });

    it('should throw Error if cipher payload format is invalid', () => {
      expect(() => service.decrypt('invalid_string_no_colons')).toThrow(
        'Invalid encrypted payload format',
      );
      expect(() => service.decrypt('part1:part2')).toThrow(
        'Invalid encrypted payload format',
      );
    });

    it('should throw Error when ciphertext or auth tag is tampered with', () => {
      const original = 'secret_credentials';
      const cipherPayload = service.encrypt(original);
      const parts = cipherPayload.split(':');

      // Tamper with the authentication tag
      const tamperedTag = 'ff'.repeat(parts[1].length / 2);
      const tamperedPayload = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      expect(() => service.decrypt(tamperedPayload)).toThrow();
    });
  });
});

