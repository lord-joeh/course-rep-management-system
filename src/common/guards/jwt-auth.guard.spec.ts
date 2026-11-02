import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);

    mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
        getResponse: jest.fn().mockReturnValue({}),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow access without calling super.canActivate if route is marked @Public()', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const superCanActivateSpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(guard)),
        'canActivate',
      );

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(superCanActivateSpy).not.toHaveBeenCalled();
    });

    it('should delegate to super.canActivate if route is not marked @Public()', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const superCanActivateSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(superCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
    });
  });

  describe('handleRequest', () => {
    it('should return user when user is valid and no error is present', () => {
      const mockUser = { id: 'std_01', email: 'test@student.edu' };

      const result = guard.handleRequest(null, mockUser, null);

      expect(result).toBe(mockUser);
    });

    it('should rethrow existing error if provided', () => {
      const customErr = new Error('Custom Passport error');

      expect(() => guard.handleRequest(customErr, null, null)).toThrow(customErr);
    });

    it('should throw UnauthorizedException with info message when user is missing', () => {
      const info = { message: 'jwt expired' };

      expect(() => guard.handleRequest(null, null, info)).toThrow(
        new UnauthorizedException('jwt expired'),
      );
    });

    it('should throw UnauthorizedException with default message when user and info are missing', () => {
      expect(() => guard.handleRequest(null, null, null)).toThrow(
        new UnauthorizedException(
          'Authentication required. Please provide a valid Bearer token.',
        ),
      );
    });
  });
});

