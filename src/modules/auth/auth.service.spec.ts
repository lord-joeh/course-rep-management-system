import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { StudentService } from '../student/student.service';
import { CacheService } from '../redis/cache.service';
import { QueueService } from '../queue/queue.service';
import { Student, StudentStatus } from '../student/entities/student.entity';
import { RefreshToken } from '../student/entities/refresh-token.entity';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto';

describe('AuthService', () => {
  let service: AuthService;
  let studentServiceMock: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    findByIdentifierWithPassword: jest.Mock;
    findByIdWithPassword: jest.Mock;
    create: jest.Mock;
  };
  let jwtServiceMock: {
    signAsync: jest.Mock;
  };
  let configServiceMock: {
    get: jest.Mock;
  };
  let cacheServiceMock: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let refreshTokenRepoMock: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    delete: jest.Mock;
  };
  let studentRepoMock: {
    update: jest.Mock;
    findOne: jest.Mock;
  };
  let queueServiceMock: {
    sendEmail: jest.Mock;
  };

  beforeEach(async () => {
    studentServiceMock = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByIdentifierWithPassword: jest.fn(),
      findByIdWithPassword: jest.fn(),
      create: jest.fn(),
    };
    jwtServiceMock = {
      signAsync: jest.fn().mockImplementation((payload) => {
        if (payload.type === 'refresh') return Promise.resolve('mock_refresh_jwt');
        return Promise.resolve('mock_access_jwt');
      }),
    };
    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'jwt.accessSecret') return 'access_secret_32_chars_long_key_mock';
        if (key === 'jwt.accessExpiresIn') return '15m';
        if (key === 'jwt.refreshSecret') return 'refresh_secret_32_chars_long_key_mock';
        if (key === 'jwt.refreshExpiresIn') return '7d';
        return null;
      }),
    };
    cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    refreshTokenRepoMock = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    studentRepoMock = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue({ id: 'std_01', name: 'Test Student' }),
    };
    queueServiceMock = {
      sendEmail: jest.fn().mockResolvedValue('job-email-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: StudentService, useValue: studentServiceMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: CacheService, useValue: cacheServiceMock },
        { provide: QueueService, useValue: queueServiceMock },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepoMock },
        { provide: getRepositoryToken(Student), useValue: studentRepoMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      id: 'std_01',
      name: 'Test Student',
      email: 'test@student.edu',
      password: 'SecurePassword123!',
      phone: '08012345678',
      isRep: false,
    };

    it('should throw ConflictException if student ID already exists', async () => {
      studentServiceMock.findById.mockResolvedValue({ id: 'std_01' });

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Student with ID "std_01" already exists'),
      );
      expect(studentServiceMock.findByEmail).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if student email already exists', async () => {
      studentServiceMock.findById.mockResolvedValue(null);
      studentServiceMock.findByEmail.mockResolvedValue({ id: 'std_02', email: 'test@student.edu' });

      await expect(service.register(registerDto)).rejects.toThrow(
        new ConflictException('Student with email "test@student.edu" already exists'),
      );
    });

    it('should register successfully, hash password, store OTP in Redis, and return token pair (dev mode)', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      studentServiceMock.findById.mockResolvedValue(null);
      studentServiceMock.findByEmail.mockResolvedValue(null);

      const createdStudent = {
        id: 'std_01',
        name: 'Test Student',
        email: 'test@student.edu',
        phone: '08012345678',
        isRep: false,
        passwordHash: 'hashed_password',
        status: StudentStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Student;
      studentServiceMock.create.mockResolvedValue(createdStudent);

      const result = await service.register(registerDto);

      expect(studentServiceMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'std_01',
          name: 'Test Student',
          email: 'test@student.edu',
          status: StudentStatus.ACTIVE,
        }),
      );
      expect(cacheServiceMock.set).toHaveBeenCalled();
      expect(refreshTokenRepoMock.save).toHaveBeenCalled();
      expect(result.student).toEqual(
        expect.not.objectContaining({ passwordHash: expect.anything() }),
      );
      expect(result.accessToken).toBe('mock_access_jwt');
      expect(result.refreshToken).toBe('mock_refresh_jwt');
      expect(result.verificationCode).toBeDefined();

      process.env.NODE_ENV = origEnv;
    });

    it('should omit verificationCode in production mode', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      studentServiceMock.findById.mockResolvedValue(null);
      studentServiceMock.findByEmail.mockResolvedValue(null);
      studentServiceMock.create.mockResolvedValue({
        id: 'std_01',
        name: 'Test Student',
        email: 'test@student.edu',
        isRep: true,
        passwordHash: 'hashed_pwd',
        status: StudentStatus.ACTIVE,
      });

      const result = await service.register({ ...registerDto, isRep: true });

      expect(result.verificationCode).toBeUndefined();
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('login', () => {
    it('should throw BadRequestException if no identifier is provided', async () => {
      await expect(service.login({} as any)).rejects.toThrow(
        new BadRequestException('Identifier (student ID or email) is required'),
      );
    });

    it('should throw UnauthorizedException if student is not found or has no passwordHash', async () => {
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue(null);

      await expect(
        service.login({ identifier: 'unknown', password: 'Pass' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      const hash = await bcrypt.hash('CorrectPass', 10);
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({
        id: 'std_01',
        passwordHash: hash,
        status: StudentStatus.ACTIVE,
      });

      await expect(
        service.login({ identifier: 'std_01', password: 'WrongPassword' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('should throw UnauthorizedException if student status is not ACTIVE', async () => {
      const hash = await bcrypt.hash('CorrectPass', 10);
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({
        id: 'std_01',
        passwordHash: hash,
        status: StudentStatus.SUSPENDED,
      });

      await expect(
        service.login({ identifier: 'std_01', password: 'CorrectPass' }),
      ).rejects.toThrow(new UnauthorizedException('Account is suspended'));
    });

    it('should authenticate with id fallback when identifier is omitted', async () => {
      const hash = await bcrypt.hash('CorrectPass', 10);
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({
        id: 'std_01',
        email: 'std@student.edu',
        name: 'John',
        isRep: false,
        passwordHash: hash,
        status: StudentStatus.ACTIVE,
      });

      const result = await service.login({ id: 'std_01', password: 'CorrectPass' });

      expect(studentServiceMock.findByIdentifierWithPassword).toHaveBeenCalledWith('std_01');
      expect(result.accessToken).toBe('mock_access_jwt');
      expect(result.student).toEqual(expect.not.objectContaining({ passwordHash: expect.anything() }));
    });

    it('should authenticate with email fallback when identifier is omitted', async () => {
      const hash = await bcrypt.hash('CorrectPass', 10);
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({
        id: 'std_01',
        email: 'std@student.edu',
        name: 'John',
        isRep: false,
        passwordHash: hash,
        status: StudentStatus.ACTIVE,
      });

      const result = await service.login({ email: 'std@student.edu', password: 'CorrectPass' });

      expect(studentServiceMock.findByIdentifierWithPassword).toHaveBeenCalledWith('std@student.edu');
      expect(result.accessToken).toBe('mock_access_jwt');
    });
  });

  describe('refreshToken', () => {
    it('should throw UnauthorizedException if refresh token is not found or revoked', async () => {
      refreshTokenRepoMock.findOne.mockResolvedValue(null);

      await expect(
        service.refreshToken({ refreshToken: 'non_existent_token' }),
      ).rejects.toThrow(new UnauthorizedException('Invalid or revoked refresh token'));
    });

    it('should remove expired token and throw UnauthorizedException', async () => {
      const expiredToken = {
        id: 'rt_1',
        token: 'hashed_token',
        expiresAt: new Date(Date.now() - 10000),
      };
      refreshTokenRepoMock.findOne.mockResolvedValue(expiredToken);

      await expect(
        service.refreshToken({ refreshToken: 'expired_token' }),
      ).rejects.toThrow(
        new UnauthorizedException('Refresh token has expired. Please log in again.'),
      );
      expect(refreshTokenRepoMock.remove).toHaveBeenCalledWith(expiredToken);
    });

    it('should throw UnauthorizedException if associated student is inactive or deleted', async () => {
      const storedToken = {
        id: 'rt_1',
        expiresAt: new Date(Date.now() + 100000),
        student: { id: 'std_01', status: StudentStatus.SUSPENDED },
      };
      refreshTokenRepoMock.findOne.mockResolvedValue(storedToken);

      await expect(
        service.refreshToken({ refreshToken: 'valid_token' }),
      ).rejects.toThrow(new UnauthorizedException('Student account is no longer active'));
    });

    it('should rotate token, remove old token, and issue new token pair', async () => {
      const storedToken = {
        id: 'rt_1',
        expiresAt: new Date(Date.now() + 100000),
        student: { id: 'std_01', email: 'std@uni.edu', isRep: false, status: StudentStatus.ACTIVE },
      };
      refreshTokenRepoMock.findOne.mockResolvedValue(storedToken);

      const result = await service.refreshToken({ refreshToken: 'valid_token' });

      expect(refreshTokenRepoMock.remove).toHaveBeenCalledWith(storedToken);
      expect(refreshTokenRepoMock.save).toHaveBeenCalled();
      expect(result.accessToken).toBe('mock_access_jwt');
      expect(result.refreshToken).toBe('mock_refresh_jwt');
    });
  });

  describe('logout', () => {
    it('should delete specific refresh token when refreshToken is provided', async () => {
      const result = await service.logout('std_01', 'token_to_revoke');

      expect(refreshTokenRepoMock.delete).toHaveBeenCalledWith(
        expect.objectContaining({ studentId: 'std_01', token: expect.any(String) }),
      );
      expect(result.message).toBe('Successfully logged out');
    });

    it('should delete all sessions for student when refreshToken is not provided', async () => {
      const result = await service.logout('std_01');

      expect(refreshTokenRepoMock.delete).toHaveBeenCalledWith({ studentId: 'std_01' });
      expect(result.message).toBe('Successfully logged out');
    });
  });

  describe('forgotPassword', () => {
    it('should return generic message if student is not found', async () => {
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue(null);

      const result = await service.forgotPassword({ identifier: 'missing@uni.edu' });

      expect(result.message).toContain('If an account exists');
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });

    it('should return generic message if student has no email', async () => {
      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({ id: 'std_01', email: '' });

      const result = await service.forgotPassword({ identifier: 'std_01' });

      expect(result.message).toContain('If an account exists');
      expect(cacheServiceMock.set).not.toHaveBeenCalled();
    });

    it('should generate reset token, store in Redis, and return token in dev mode', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({
        id: 'std_01',
        email: 'std@uni.edu',
      });

      const result = await service.forgotPassword({ identifier: 'std_01' });

      expect(cacheServiceMock.set).toHaveBeenCalledWith(
        expect.stringContaining('cr:auth:reset:'),
        { studentId: 'std_01', email: 'std@uni.edu' },
        900,
      );
      expect(result.resetToken).toBeDefined();

      process.env.NODE_ENV = origEnv;
    });

    it('should omit resetToken in production mode', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      studentServiceMock.findByIdentifierWithPassword.mockResolvedValue({
        id: 'std_01',
        email: 'std@uni.edu',
      });

      const result = await service.forgotPassword({ identifier: 'std_01' });

      expect(result.resetToken).toBeUndefined();

      process.env.NODE_ENV = origEnv;
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException if token is not found in Redis or missing studentId', async () => {
      cacheServiceMock.get.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'invalid_token', newPassword: 'NewPassword123!' }),
      ).rejects.toThrow(new BadRequestException('Invalid or expired password reset token'));
    });

    it('should update student password, revoke all refresh tokens, and delete Redis key', async () => {
      cacheServiceMock.get.mockResolvedValue({ studentId: 'std_01', email: 'std@uni.edu' });

      const result = await service.resetPassword({
        token: 'valid_token',
        newPassword: 'NewSecurePassword123!',
      });

      expect(cacheServiceMock.del).toHaveBeenCalledWith('cr:auth:reset:valid_token');
      expect(studentRepoMock.update).toHaveBeenCalledWith(
        'std_01',
        expect.objectContaining({ passwordHash: expect.any(String) }),
      );
      expect(refreshTokenRepoMock.delete).toHaveBeenCalledWith({ studentId: 'std_01' });
      expect(result.message).toContain('Password has been successfully reset');
    });
  });

  describe('changePassword', () => {
    it('should throw BadRequestException if student is not found or has no passwordHash', async () => {
      studentServiceMock.findByIdWithPassword.mockResolvedValue(null);

      await expect(
        service.changePassword('std_01', {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(new BadRequestException('Student record not found'));
    });

    it('should throw BadRequestException if current password does not match', async () => {
      const hash = await bcrypt.hash('CorrectCurrentPassword', 10);
      studentServiceMock.findByIdWithPassword.mockResolvedValue({
        id: 'std_01',
        passwordHash: hash,
      });

      await expect(
        service.changePassword('std_01', {
          currentPassword: 'WrongCurrentPassword',
          newPassword: 'NewPassword123!',
        }),
      ).rejects.toThrow(new BadRequestException('Current password does not match'));
    });

    it('should successfully update password and revoke refresh tokens on valid credentials', async () => {
      const hash = await bcrypt.hash('CorrectCurrentPassword', 10);
      studentServiceMock.findByIdWithPassword.mockResolvedValue({
        id: 'std_01',
        passwordHash: hash,
      });

      const result = await service.changePassword('std_01', {
        currentPassword: 'CorrectCurrentPassword',
        newPassword: 'NewPassword123!',
      });

      expect(studentRepoMock.update).toHaveBeenCalledWith(
        'std_01',
        expect.objectContaining({ passwordHash: expect.any(String) }),
      );
      expect(refreshTokenRepoMock.delete).toHaveBeenCalledWith({ studentId: 'std_01' });
      expect(result.message).toContain('Password successfully changed');
    });
  });

  describe('generateTokenPair fallbacks', () => {
    it(
      'should use default fallback secrets when configService returns null and env is unset',
      async () => {
      const origAccessSecret = process.env.JWT_ACCESS_SECRET;
      const origRefreshSecret = process.env.JWT_REFRESH_SECRET;
      delete process.env.JWT_ACCESS_SECRET;
      delete process.env.JWT_REFRESH_SECRET;

      configServiceMock.get.mockReturnValue(null);

      studentServiceMock.findById.mockResolvedValue(null);
      studentServiceMock.findByEmail.mockResolvedValue(null);
      studentServiceMock.create.mockResolvedValue({
        id: 'std_fallbacks',
        name: 'Fallback Student',
        email: 'fallback@student.edu',
        isRep: false,
        passwordHash: 'h',
        status: StudentStatus.ACTIVE,
      });

      const result = await service.register({
        id: 'std_fallbacks',
        name: 'Fallback Student',
        email: 'fallback@student.edu',
        password: 'Pass',
        phone: '123',
        isRep: false,
      });

      expect(result.accessToken).toBe('mock_access_jwt');

      process.env.JWT_ACCESS_SECRET = origAccessSecret;
      process.env.JWT_REFRESH_SECRET = origRefreshSecret;
    }, 15000);
  });
});

