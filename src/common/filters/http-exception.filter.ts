import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ApiErrorResponse } from "../interfaces/api-response.interface";

@Injectable()
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let errors: any = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === "string") {
        message = res;
      } else if (typeof res === "object" && res !== null) {
        const errorObj = res as Record<string, any>;
        message = errorObj.message || exception.message;

        // If class-validator returned an array of messages
        if (Array.isArray(errorObj.message)) {
          errors = errorObj.message;
          message = "Validation failed";
        } else if (errorObj.errors) {
          errors = errorObj.errors;
        }
      }
    } else if (this.isDatabaseError(exception)) {
      // Handle PostgreSQL / TypeORM query errors gracefully
      const dbError = exception as any;
      if (dbError.code === "23505") {
        // Unique constraint violation
        statusCode = HttpStatus.CONFLICT;
        message = "A record with this unique identifier already exists";
        errors =
          process.env.NODE_ENV === "development" ? dbError.detail : undefined;
      } else if (dbError.code === "23503") {
        // Foreign key violation
        statusCode = HttpStatus.BAD_REQUEST;
        message = "Referenced resource does not exist";
        errors =
          process.env.NODE_ENV === "development" ? dbError.detail : undefined;
      } else {
        statusCode = HttpStatus.BAD_REQUEST;
        message = "Database operation failed";
        errors =
          process.env.NODE_ENV === "development" ? dbError.message : undefined;
      }

      this.logger.error(
        `Database Exception: ${dbError.message}`,
        dbError.stack,
      );
    } else {
      // Unhandled general error
      const generalError = exception as Error;
      message = "An unexpected internal server error occurred";
      if (process.env.NODE_ENV === "development") {
        errors = generalError?.message || String(exception);
      }
      this.logger.error(
        `Unhandled Exception: ${generalError?.message || exception}`,
        generalError?.stack,
      );
    }

    const errorPayload: ApiErrorResponse = {
      success: false,
      statusCode,
      message,
      ...(errors ? { errors } : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl || request.url,
    };

    response.status(statusCode).json(errorPayload);
  }

  private isDatabaseError(err: any): boolean {
    return Boolean(
      err &&
      (err.name === "QueryFailedError" ||
        err.code?.startsWith("23") || // PostgreSQL integrity constraint violation class
        err.code?.startsWith("42")), // PostgreSQL syntax or schema error class
    );
  }
}
