import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BullBoardAuthGuard } from './guards/bull-board-auth.guard';

describe('BullBoardAuthGuard', () => {
  let guard: BullBoardAuthGuard;
  let configService: ConfigService;
  let jwtService: JwtService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  beforeEach(() => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'ADMIN_ALLOWED_IPS') return '127.0.0.1,::1,localhost';
      if (key === 'JWT_ACCESS_SECRET') return 'test_jwt_secret';
      return defaultValue;
    });

    configService = mockConfigService as any;
    jwtService = mockJwtService as any;
    guard = new BullBoardAuthGuard(configService, jwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createMockContext(req: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  }

  it('should allow access for valid rep with localhost IP and pre-authenticated user', async () => {
    const req = {
      ip: '127.0.0.1',
      headers: {},
      user: { id: 'rep-1', isRep: true },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access for IPv6 loopback (::1)', async () => {
    const req = {
      ip: '::1',
      headers: {},
      user: { id: 'rep-1', isRep: true },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access using x-forwarded-for header IP', async () => {
    const req = {
      headers: {
        'x-forwarded-for': '127.0.0.1, 192.168.1.1',
      },
      user: { id: 'rep-1', isRep: true },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access when ADMIN_ALLOWED_IPS is wildcard (*)', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'ADMIN_ALLOWED_IPS') return '*';
      if (key === 'JWT_ACCESS_SECRET') return 'test_jwt_secret';
      return defaultValue;
    });

    const req = {
      ip: '198.51.100.25',
      headers: {},
      user: { id: 'rep-1', isRep: true },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should reject request from unauthorized IP address', async () => {
    const req = {
      ip: '203.0.113.195',
      headers: {},
      user: { id: 'rep-1', isRep: true },
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should fallback to JWT_SECRET when JWT_ACCESS_SECRET is not configured', async () => {
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'ADMIN_ALLOWED_IPS') return '127.0.0.1';
      if (key === 'JWT_ACCESS_SECRET') return null;
      if (key === 'JWT_SECRET') return 'fallback_secret';
      return defaultValue;
    });

    mockJwtService.verifyAsync.mockResolvedValue({ id: 'rep-fallback', isRep: true });
    const req = {
      ip: '127.0.0.1',
      headers: {
        authorization: 'Bearer fallback.token',
      },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('fallback.token', {
      secret: 'fallback_secret',
    });
  });

  it('should authenticate via Bearer token when req.user is absent', async () => {
    mockJwtService.verifyAsync.mockResolvedValue({ id: 'rep-jwt', isRep: true });
    const req = {
      ip: '127.0.0.1',
      headers: {
        authorization: 'Bearer valid.jwt.token',
      },
    };
    const context = createMockContext(req);

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('valid.jwt.token', {
      secret: 'test_jwt_secret',
    });
  });

  it('should throw UnauthorizedException when authorization header is missing and req.user is absent', async () => {
    const req = {
      ip: '127.0.0.1',
      headers: {},
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Authentication token required for queue board access'),
    );
  });

  it('should throw UnauthorizedException when token verification fails', async () => {
    mockJwtService.verifyAsync.mockRejectedValue(new Error('TokenExpiredError'));
    const req = {
      ip: '127.0.0.1',
      headers: {
        authorization: 'Bearer expired.token',
      },
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired authentication token'),
    );
  });

  it('should throw ForbiddenException when authenticated user is not a Course Rep', async () => {
    const req = {
      ip: '127.0.0.1',
      headers: {},
      user: { id: 'student-regular', isRep: false },
    };
    const context = createMockContext(req);

    await expect(guard.canActivate(context)).rejects.toThrow(
      new ForbiddenException('Course Representative privileges required to access queue dashboard'),
    );
  });
});
