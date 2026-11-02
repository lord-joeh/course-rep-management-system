import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { TransformInterceptor } from './transform.interceptor';

describe('TransformInterceptor', () => {
  let interceptor: TransformInterceptor<any>;
  let mockExecutionContext: ExecutionContext;
  let mockResponse: { statusCode: number };

  beforeEach(() => {
    interceptor = new TransformInterceptor();
    mockResponse = { statusCode: 200 };
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should preserve already formatted responses with default fallback statusCode and timestamp', (done) => {
    const alreadyFormatted = {
      success: true,
      data: { id: 1 },
    };
    const callHandler: CallHandler = {
      handle: () => of(alreadyFormatted),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data).toEqual({ id: 1 });
        expect(result.timestamp).toBeDefined();
        done();
      },
      error: done,
    });
  });

  it('should preserve already formatted responses when custom statusCode and timestamp are provided', (done) => {
    const customTime = '2026-01-01T00:00:00.000Z';
    const alreadyFormatted = {
      success: true,
      statusCode: 201,
      timestamp: customTime,
      data: { id: 2 },
    };
    const callHandler: CallHandler = {
      handle: () => of(alreadyFormatted),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (result) => {
        expect(result.statusCode).toBe(201);
        expect(result.timestamp).toBe(customTime);
        expect(result.data).toEqual({ id: 2 });
        done();
      },
      error: done,
    });
  });

  it('should extract custom message and data when both exist in controller return object', (done) => {
    const controllerResult = {
      message: 'Item updated successfully',
      data: { id: 'item-1', name: 'Item' },
    };
    const callHandler: CallHandler = {
      handle: () => of(controllerResult),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.message).toBe('Item updated successfully');
        expect(result.data).toEqual({ id: 'item-1', name: 'Item' });
        expect(result.timestamp).toBeDefined();
        done();
      },
      error: done,
    });
  });

  it('should handle controller response having only a message property (setting data to null)', (done) => {
    const controllerResult = {
      message: 'Resource deleted',
    };
    const callHandler: CallHandler = {
      handle: () => of(controllerResult),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        expect(result.message).toBe('Resource deleted');
        expect(result.data).toBeNull();
        done();
      },
      error: done,
    });
  });

  it('should format raw data payload without message property', (done) => {
    const rawPayload = { id: 'std_01', score: 95 };
    const callHandler: CallHandler = {
      handle: () => of(rawPayload),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        expect(result.statusCode).toBe(200);
        expect(result.data).toEqual(rawPayload);
        expect(result.message).toBeUndefined();
        done();
      },
      error: done,
    });
  });

  it('should format primitive string or null return values', (done) => {
    const callHandler: CallHandler = {
      handle: () => of('plain string'),
    };

    interceptor.intercept(mockExecutionContext, callHandler).subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        expect(result.data).toBe('plain string');
        done();
      },
      error: done,
    });
  });
});

