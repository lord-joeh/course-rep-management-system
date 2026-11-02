import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode;

        // If response is already formatted or null/empty
        if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
          return {
            ...data,
            statusCode: data.statusCode || statusCode,
            timestamp: data.timestamp || new Date().toISOString(),
          };
        }

        // If controller returned an object with custom message and data property
        let message: string | undefined;
        let responseData = data;

        if (data && typeof data === 'object' && 'message' in data && 'data' in data) {
          message = data.message;
          responseData = data.data;
        } else if (data && typeof data === 'object' && 'message' in data && Object.keys(data).length === 1) {
          message = data.message;
          responseData = null;
        }

        return {
          success: true,
          statusCode,
          ...(message ? { message } : {}),
          data: responseData,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}

