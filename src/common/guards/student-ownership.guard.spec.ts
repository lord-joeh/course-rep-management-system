import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { StudentOwnershipGuard } from './student-ownership.guard';
import { AuthenticatedUser } from '../types/jwt-payload.interface';

describe('StudentOwnershipGuard', () => {
  let guard: StudentOwnershipGuard;
  let mockRequest: {
    user?: AuthenticatedUser;
    params?: { id?: string };
  };
  let mockExecutionContext: ExecutionContext;

  beforeEach(() => {
    guard = new StudentOwnershipGuard();
    mockRequest = {};
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should throw ForbiddenException if user context is missing', () => {
    mockRequest.user = undefined;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException('User authentication context not found'),
    );
  });

  it('should allow access if user isRep is true', () => {
    mockRequest.user = {
      id: 'rep_01',
      email: 'rep@student.edu',
      name: 'Rep User',
      phone: '08012345678',
      isRep: true,
      role: 'STUDENT',
      status: 'active',
    };
    mockRequest.params = { id: 'other_student_02' };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access if user role is "REP"', () => {
    mockRequest.user = {
      id: 'rep_02',
      email: 'rep2@student.edu',
      name: 'Rep User 2',
      phone: '08012345678',
      isRep: false,
      role: 'REP',
      status: 'active',
    };
    mockRequest.params = { id: 'other_student_02' };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access if user role is "ADMIN"', () => {
    mockRequest.user = {
      id: 'admin_01',
      email: 'admin@uni.edu',
      name: 'Admin User',
      phone: '08012345678',
      isRep: false,
      role: 'ADMIN',
      status: 'active',
    };
    mockRequest.params = { id: 'other_student_02' };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should allow access if regular student is requesting their own profile', () => {
    mockRequest.user = {
      id: 'std_01',
      email: 'std@student.edu',
      name: 'Regular Student',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };
    mockRequest.params = { id: 'std_01' };

    expect(guard.canActivate(mockExecutionContext)).toBe(true);
  });

  it('should throw ForbiddenException if regular student tries to access another student profile', () => {
    mockRequest.user = {
      id: 'std_01',
      email: 'std@student.edu',
      name: 'Regular Student',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };
    mockRequest.params = { id: 'std_02' };

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        "You do not have permission to view or access another student's profile",
      ),
    );
  });

  it('should throw ForbiddenException if params.id is undefined and user is not rep/admin', () => {
    mockRequest.user = {
      id: 'std_01',
      email: 'std@student.edu',
      name: 'Regular Student',
      phone: '08012345678',
      isRep: false,
      role: 'STUDENT',
      status: 'active',
    };
    mockRequest.params = undefined;

    expect(() => guard.canActivate(mockExecutionContext)).toThrow(
      new ForbiddenException(
        "You do not have permission to view or access another student's profile",
      ),
    );
  });
});

