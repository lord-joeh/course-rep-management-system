import { HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockArgumentsHost: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockRequest = {
      originalUrl: '/api/test',
      url: '/test',
    };
    mockArgumentsHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle standard HttpException with string response', () => {
    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 403,
        message: 'Forbidden resource',
        path: '/api/test',
      }),
    );
  });

  it('should handle HttpException with object message', () => {
    const exception = new HttpException(
      { message: 'Custom message' },
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 401,
        message: 'Custom message',
      }),
    );
  });

  it('should handle class-validator validation array error responses', () => {
    const exception = new BadRequestException([
      'email must be a valid email',
      'password is too short',
    ]);

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errors: ['email must be a valid email', 'password is too short'],
      }),
    );
  });

  it('should handle HttpException with explicit errors field', () => {
    const exception = new HttpException(
      { message: 'Invalid payload', errors: { field: 'required' } },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        errors: { field: 'required' },
      }),
    );
  });

  it('should map PostgreSQL 23505 unique constraint violation to 409 Conflict', () => {
    const dbError = {
      name: 'QueryFailedError',
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      detail: 'Key (email)=(test@knust.edu.gh) already exists.',
    };

    filter.catch(dbError, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'A record with this unique identifier already exists',
      }),
    );
  });

  it('should map PostgreSQL 23503 foreign key violation to 400 Bad Request', () => {
    const dbError = {
      name: 'QueryFailedError',
      code: '23503',
      message: 'insert or update on table violates foreign key constraint',
      detail: 'Key (student_id)=(unknown) is not present in table "student".',
    };

    filter.catch(dbError, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Referenced resource does not exist',
      }),
    );
  });

  it('should map other PostgreSQL database errors to 400 Bad Request', () => {
    const dbError = {
      code: '42601',
      message: 'syntax error at or near SELECT',
    };

    filter.catch(dbError, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Database operation failed',
      }),
    );
  });

  it('should handle unexpected general Error as 500 Internal Server Error', () => {
    const generalError = new Error('Unexpected crash');

    filter.catch(generalError, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected internal server error occurred',
      }),
    );
  });

  it('should fallback to request.url when originalUrl is absent', () => {
    mockRequest.originalUrl = undefined;
    mockRequest.url = '/fallback-path';

    const exception = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/fallback-path',
      }),
    );
  });

  it('should extract errorObj.errors when present in exception response', () => {
    const exception = new HttpException(
      { message: 'Custom Error', errors: ['Field error 1', 'Field error 2'] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: ['Field error 1', 'Field error 2'],
      }),
    );
  });

  it('should fallback to exception.message when errorObj does not have a message property', () => {
    const exception = new HttpException(
      { errors: ['Field error without message'] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Http Exception',
        errors: ['Field error without message'],
      }),
    );
  });

  describe('Development Mode Error Details', () => {
    const origEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });

    afterEach(() => {
      process.env.NODE_ENV = origEnv;
    });

    it('should include detail for 23505 unique constraint in development mode', () => {
      const dbError = {
        name: 'QueryFailedError',
        code: '23505',
        message: 'duplicate key',
        detail: 'Key (email)=(test@edu) already exists.',
      };

      filter.catch(dbError, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: 'Key (email)=(test@edu) already exists.',
        }),
      );
    });

    it('should include detail for 23503 foreign key violation in development mode', () => {
      const dbError = {
        name: 'QueryFailedError',
        code: '23503',
        message: 'fk violation',
        detail: 'Key (rep_id)=(999) is not present in table.',
      };

      filter.catch(dbError, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: 'Key (rep_id)=(999) is not present in table.',
        }),
      );
    });

    it('should include error message for generic DB error in development mode', () => {
      const dbError = {
        code: '42601',
        message: 'syntax error at line 1',
      };

      filter.catch(dbError, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: 'syntax error at line 1',
        }),
      );
    });

    it('should include general error message for unhandled error in development mode', () => {
      const generalError = new Error('Unhandled fatal error');

      filter.catch(generalError, mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: 'Unhandled fatal error',
        }),
      );
    });

    it('should handle raw string exception in development mode', () => {
      filter.catch('Raw string exception thrown', mockArgumentsHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: 'Raw string exception thrown',
        }),
      );
    });
  });
});

