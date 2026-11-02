import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { QueryFailedError } from 'typeorm';

import { AppException } from './app.exception';
import {
  DEFAULT_CODE_BY_STATUS,
  ErrorCode,
  STATUS_BY_CODE,
} from './error-codes';

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
}

const PG_UNIQUE_VIOLATION = '23505';
const DB_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000',
  '08003',
  '08006',
]);

/**
 * Converts any thrown value into the single safe error shape.
 * Stack traces and internal messages are never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();

    const body = this.toBody(exception, request?.id);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} -> ${body.statusCode} ${body.code} [${request?.id}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    void reply.status(body.statusCode).send(body);
  }

  toBody(exception: unknown, requestId?: string): ErrorBody {
    const base = this.resolve(exception);
    const body: ErrorBody = { ...base, requestId };
    if (body.details === undefined) delete body.details;
    return body;
  }

  private resolve(exception: unknown): Omit<ErrorBody, 'requestId'> {
    if (exception instanceof AppException) {
      return {
        statusCode: STATUS_BY_CODE[exception.code],
        code: exception.code,
        message: exception.message,
        details: exception.details,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: 429,
        code: ErrorCode.RateLimitExceeded,
        message: 'Too many requests',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      let message = exception.message;
      let details: unknown;
      if (typeof response === 'object' && response !== null) {
        const r = response as { message?: unknown };
        if (Array.isArray(r.message)) {
          // class-validator errors
          message = 'Validation failed';
          details = r.message;
        } else if (typeof r.message === 'string') {
          message = r.message;
        }
      }
      return this.fromStatus(status, message, details);
    }

    if (exception instanceof QueryFailedError) {
      const driverError = (exception as { driverError?: { code?: string } })
        .driverError;
      if (driverError?.code === PG_UNIQUE_VIOLATION) {
        return {
          statusCode: 409,
          code: ErrorCode.Conflict,
          message: 'Resource already exists',
        };
      }
      if (driverError?.code && DB_UNAVAILABLE_CODES.has(driverError.code)) {
        return this.unavailable();
      }
      return this.internal();
    }

    // Fastify errors (body too large, unsupported media type, ...) and
    // low-level connection errors.
    if (typeof exception === 'object' && exception !== null) {
      const e = exception as { statusCode?: unknown; code?: unknown };
      if (
        typeof e.statusCode === 'number' &&
        e.statusCode >= 400 &&
        e.statusCode < 600
      ) {
        return this.fromStatus(e.statusCode, 'Request failed');
      }
      if (typeof e.code === 'string' && DB_UNAVAILABLE_CODES.has(e.code)) {
        return this.unavailable();
      }
    }

    return this.internal();
  }

  private fromStatus(
    status: number,
    message: string,
    details?: unknown,
  ): Omit<ErrorBody, 'requestId'> {
    const code = DEFAULT_CODE_BY_STATUS[status];
    if (!code) {
      return status >= 500
        ? this.internal()
        : {
            statusCode: 400,
            code: ErrorCode.BadRequest,
            message,
            details,
          };
    }
    return { statusCode: status, code, message, details };
  }

  private unavailable(): Omit<ErrorBody, 'requestId'> {
    return {
      statusCode: 503,
      code: ErrorCode.ServiceUnavailable,
      message: 'Service temporarily unavailable',
    };
  }

  private internal(): Omit<ErrorBody, 'requestId'> {
    return {
      statusCode: 500,
      code: ErrorCode.InternalError,
      message: 'Internal server error',
    };
  }
}
