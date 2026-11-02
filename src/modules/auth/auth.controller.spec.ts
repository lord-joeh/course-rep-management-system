import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto';
import { AuthenticatedUser } from '../../common/types/jwt-payload.interface';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: {
    register: jest.Mock;
    login: jest.Mock;
    refreshToken: jest.Mock;
    forgotPassword: jest.Mock;
    resetPassword: jest.Mock;
    logout: jest.Mock;
    changePassword: jest.Mock;
  };

  beforeEach(async () => {
    authServiceMock = {
      register: jest.fn(),
      login: jest.fn(),
      refreshToken: jest.fn(),
      forgotPassword: jest.fn(),
      resetPassword: jest.fn(),
      logout: jest.fn(),
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call authService.register and return result', async () => {
    const dto: RegisterDto = {
      id: 'std_01',
      name: 'John Doe',
      email: 'john@uni.edu',
      password: 'StrongPassword123!',
      phone: '08012345678',
      isRep: false,
    };
    const expected = { student: { id: 'std_01' }, accessToken: 'jwt', refreshToken: 'rt' };
    authServiceMock.register.mockResolvedValue(expected);

    const result = await controller.register(dto);
    expect(authServiceMock.register).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('should call authService.login and return result', async () => {
    const dto: LoginDto = {
      identifier: 'john@uni.edu',
      password: 'StrongPassword123!',
    };
    const expected = { student: { id: 'std_01' }, accessToken: 'jwt', refreshToken: 'rt' };
    authServiceMock.login.mockResolvedValue(expected);

    const result = await controller.login(dto);
    expect(authServiceMock.login).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('should call authService.refreshToken and return result', async () => {
    const dto: RefreshTokenDto = {
      refreshToken: 'old-refresh-token',
    };
    const expected = { accessToken: 'new-jwt', refreshToken: 'new-rt' };
    authServiceMock.refreshToken.mockResolvedValue(expected);

    const result = await controller.refreshToken(dto);
    expect(authServiceMock.refreshToken).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('should call authService.forgotPassword and return result', async () => {
    const dto: ForgotPasswordDto = {
      identifier: 'john@uni.edu',
    };
    const expected = { message: 'Instructions dispatched' };
    authServiceMock.forgotPassword.mockResolvedValue(expected);

    const result = await controller.forgotPassword(dto);
    expect(authServiceMock.forgotPassword).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('should call authService.resetPassword and return result', async () => {
    const dto: ResetPasswordDto = {
      token: 'valid-reset-token',
      newPassword: 'BrandNewPassword123!',
    };
    const expected = { message: 'Password reset successfully' };
    authServiceMock.resetPassword.mockResolvedValue(expected);

    const result = await controller.resetPassword(dto);
    expect(authServiceMock.resetPassword).toHaveBeenCalledWith(dto);
    expect(result).toBe(expected);
  });

  it('should call authService.logout with studentId and refreshToken', async () => {
    const expected = { message: 'Successfully logged out' };
    authServiceMock.logout.mockResolvedValue(expected);

    const result = await controller.logout('std_01', { refreshToken: 'rt_token' });
    expect(authServiceMock.logout).toHaveBeenCalledWith('std_01', 'rt_token');
    expect(result).toBe(expected);
  });

  it('should call authService.logout with studentId and undefined refreshToken when body is empty', async () => {
    const expected = { message: 'Successfully logged out' };
    authServiceMock.logout.mockResolvedValue(expected);

    const result = await controller.logout('std_01', undefined as any);
    expect(authServiceMock.logout).toHaveBeenCalledWith('std_01', undefined);
    expect(result).toBe(expected);
  });

  it('should return user from profile endpoint', async () => {
    const user: AuthenticatedUser = {
      id: 'std_01',
      email: 'john@uni.edu',
      name: 'John Doe',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };

    const result = await controller.getProfile(user);
    expect(result).toBe(user);
  });

  it('should call authService.changePassword and return result', async () => {
    const dto: ChangePasswordDto = {
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword123!',
    };
    const expected = { message: 'Password changed successfully' };
    authServiceMock.changePassword.mockResolvedValue(expected);

    const result = await controller.changePassword('std_01', dto);
    expect(authServiceMock.changePassword).toHaveBeenCalledWith('std_01', dto);
    expect(result).toBe(expected);
  });
});

