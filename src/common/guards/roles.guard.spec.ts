import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;
  let mockExecutionContext: ExecutionContext;
  let mockRequest: { user?: AuthenticatedUser };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);

    mockRequest = {};
    mockExecutionContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access if no roles are required (empty or null)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(null);
    expect(guard.canActivate(mockExecutionContext)).toBe(true);

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should throw ForbiddenException if user is missing from request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.REP]);
    mockRequest.user = undefined;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException('User context not found'),
    );
  });

  it('should allow access when required role is REP and user isRep is true', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.REP]);
    mockRequest.user = {
      id: 'rep_01',
      email: 'rep@student.edu',
      name: 'Rep User',
      phone: '08012345678',
      isRep: true,
      role: 'STUDENT',
      status: 'active',
    };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access when required role is REP and user.role is "REP"', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['REP']);
    mockRequest.user = {
      id: 'rep_02',
      email: 'rep2@student.edu',
      name: 'Rep User 2',
      phone: '08012345678',
      isRep: false,
      role: 'REP',
      status: 'active',
    };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access when required role is ADMIN and user.role is "ADMIN"', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    mockRequest.user = {
      id: 'admin_01',
      email: 'admin@uni.edu',
      name: 'Admin User',
      phone: '08012345678',
      isRep: false,
      role: 'ADMIN',
      status: 'active',
    };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access when required role is STUDENT for any authenticated student', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.STUDENT]);
    mockRequest.user = {
      id: 'std_01',
      email: 'std@student.edu',
      name: 'Regular Student',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access when user role matches a custom string role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['CUSTOM_ROLE']);
    mockRequest.user = {
      id: 'user_01',
      email: 'user@student.edu',
      name: 'Custom User',
      phone: '08012345678',
      isRep: false,
      role: 'CUSTOM_ROLE' as any,
      status: 'active',
    };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should throw ForbiddenException when user does not have the required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.REP]);
    mockRequest.user = {
      id: 'std_01',
      email: 'std@student.edu',
      name: 'Regular Student',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException('Insufficient privileges. Required role(s): [REP]'),
    );
  });
});

