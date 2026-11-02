import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { StudentService } from '../../student/student.service';
import { Student, StudentStatus } from '../../student/entities/student.entity';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let configServiceMock: Partial<ConfigService>;
  let studentServiceMock: {
    findById: jest.Mock;
  };

  beforeEach(() => {
    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'jwt.accessSecret') return 'test_super_secret_jwt_access_key_32_chars';
        return null;
      }),
    };

    studentServiceMock = {
      findById: jest.fn(),
    };

    strategy = new JwtStrategy(
      configServiceMock as ConfigService,
      studentServiceMock as unknown as StudentService,
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should initialize with fallback secret if configService returns null and env is unset', () => {
    const origSecret = process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_ACCESS_SECRET;

    const fallbackConfig: Partial<ConfigService> = {
      get: jest.fn().mockReturnValue(null),
    };
    const strat = new JwtStrategy(
      fallbackConfig as ConfigService,
      studentServiceMock as unknown as StudentService,
    );

    expect(strat).toBeDefined();
    process.env.JWT_ACCESS_SECRET = origSecret;
  });

  it('should throw UnauthorizedException if payload is missing or missing sub', async () => {
    await expect(strategy.validate(null as any)).rejects.toThrow(
      new UnauthorizedException('Malformed token payload'),
    );

    await expect(strategy.validate({} as any)).rejects.toThrow(
      new UnauthorizedException('Malformed token payload'),
    );
  });

  it('should throw UnauthorizedException if student is not found in database', async () => {
    studentServiceMock.findById.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'missing_id', email: 'none@uni.edu' } as any),
    ).rejects.toThrow(new UnauthorizedException('Student account not found'));
  });

  it('should throw UnauthorizedException if student status is not ACTIVE', async () => {
    const student = {
      id: 'std_01',
      status: StudentStatus.SUSPENDED,
    } as Student;
    studentServiceMock.findById.mockResolvedValue(student);

    await expect(
      strategy.validate({ sub: 'std_01', email: 'suspended@uni.edu' } as any),
    ).rejects.toThrow(new UnauthorizedException('Student account is suspended'));
  });

  it('should return AuthenticatedUser with REP role when student is course rep', async () => {
    const student: Partial<Student> = {
      id: 'rep_01',
      email: 'rep@uni.edu',
      name: 'Course Rep One',
      phone: '08012345678',
      isRep: true,
      status: StudentStatus.ACTIVE,
    };
    studentServiceMock.findById.mockResolvedValue(student);

    const user = await strategy.validate({ sub: 'rep_01', email: 'rep@uni.edu' } as any);

    expect(user).toEqual({
      id: 'rep_01',
      email: 'rep@uni.edu',
      name: 'Course Rep One',
      phone: '08012345678',
      isRep: true,
      role: 'REP',
      status: StudentStatus.ACTIVE,
    });
  });

  it('should return AuthenticatedUser with STUDENT role when student is not course rep', async () => {
    const student: Partial<Student> = {
      id: 'std_02',
      email: 'std@uni.edu',
      name: 'Regular Student',
      phone: '08087654321',
      isRep: false,
      status: StudentStatus.ACTIVE,
    };
    studentServiceMock.findById.mockResolvedValue(student);

    const user = await strategy.validate({ sub: 'std_02', email: 'std@uni.edu' } as any);

    expect(user).toEqual({
      id: 'std_02',
      email: 'std@uni.edu',
      name: 'Regular Student',
      phone: '08087654321',
      isRep: false,
      role: 'STUDENT',
      status: StudentStatus.ACTIVE,
    });
  });
});

