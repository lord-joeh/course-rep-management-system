import { ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockRequest: any;
  let mockResponse: any;
  let mockExecutionContext: ExecutionContext;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    mockRequest = {
      method: 'GET',
      originalUrl: '/api/test',
      ip: '127.0.0.1',
      get: jest.fn(),
    };
    mockResponse = {
      statusCode: 200,
    };
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;

    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should log successful requests with provided user-agent', (done) => {
    mockRequest.get.mockReturnValue('Mozilla/5.0');
    mockResponse.statusCode = 200;

    const callHandler: CallHandler = {
      handle: () => of({ test: 'ok' }),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ test: 'ok' });
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[GET] /api/test 200 -'),
        );
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[IP: 127.0.0.1] [UA: Mozilla/5.0]'),
        );
        done();
      },
      error: done,
    });
  });

  it('should log successful requests with fallback "unknown" user-agent when header is omitted', (done) => {
    mockRequest.get.mockReturnValue(undefined);

    const callHandler: CallHandler = {
      handle: () => of(null),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: () => {
        expect(loggerLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[UA: unknown]'),
        );
        done();
      },
      error: done,
    });
  });

  it('should log error when downstream throws error with status property', (done) => {
    const errorObj = { status: 403, message: 'Forbidden access' };
    const callHandler: CallHandler = {
      handle: () => throwError(() => errorObj),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: () => done(new Error('Should not have succeeded')),
      error: (err) => {
        expect(err).toBe(errorObj);
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[GET] /api/test 403 -'),
        );
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error: Forbidden access'),
        );
        done();
      },
    });
  });

  it('should log error when downstream throws error with statusCode property', (done) => {
    const errorObj = { statusCode: 404, message: 'Not found' };
    const callHandler: CallHandler = {
      handle: () => throwError(() => errorObj),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: () => done(new Error('Should not have succeeded')),
      error: () => {
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[GET] /api/test 404 -'),
        );
        done();
      },
    });
  });

  it('should fallback to 500 status code and raw string message when error has no status or message', (done) => {
    const rawError = 'Database failure';
    const callHandler: CallHandler = {
      handle: () => throwError(() => rawError),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: () => done(new Error('Should not have succeeded')),
      error: () => {
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('[GET] /api/test 500 -'),
        );
        expect(loggerWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error: Database failure'),
        );
        done();
      },
    });
  });
});

