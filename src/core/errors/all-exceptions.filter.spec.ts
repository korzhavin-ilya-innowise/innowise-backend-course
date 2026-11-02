import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { QueryFailedError } from 'typeorm';

import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  const body = (e: unknown) => filter.toBody(e, 'rid');

  it('maps AppException with status derived from code', () => {
    expect(body(AppException.csrfRejected())).toMatchObject({
      statusCode: 403,
      code: 'csrf_rejected',
      requestId: 'rid',
    });
    expect(body(AppException.invalidCredentials())).toMatchObject({
      statusCode: 401,
      code: 'invalid_credentials',
    });
    expect(body(AppException.authorizationUnavailable())).toMatchObject({
      statusCode: 503,
      code: 'authorization_unavailable',
    });
  });

  it('maps validation errors to 400 bad_request with details', () => {
    const r = body(new BadRequestException(['email must be an email']));
    expect(r).toMatchObject({
      statusCode: 400,
      code: ErrorCode.BadRequest,
      message: 'Validation failed',
      details: ['email must be an email'],
    });
  });

  it('maps generic HttpExceptions by status', () => {
    expect(body(new NotFoundException()).code).toBe('not_found');
    expect(body(new ForbiddenException()).code).toBe('permission_denied');
  });

  it('maps throttler to 429', () => {
    expect(body(new ThrottlerException())).toMatchObject({
      statusCode: 429,
      code: 'rate_limit_exceeded',
    });
  });

  it('maps postgres unique violation to 409', () => {
    const err = new QueryFailedError('insert', [], {
      code: '23505',
    } as unknown as Error);
    expect(body(err)).toMatchObject({ statusCode: 409, code: 'conflict' });
  });

  it('maps fastify errors carrying statusCode', () => {
    expect(body({ statusCode: 413 })).toMatchObject({
      statusCode: 413,
      code: 'payload_too_large',
    });
    expect(body({ statusCode: 415 }).code).toBe('unsupported_media_type');
  });

  it('maps connection errors to 503', () => {
    expect(body({ code: 'ECONNREFUSED' })).toMatchObject({
      statusCode: 503,
      code: 'service_unavailable',
    });
  });

  it('hides internals of unknown errors', () => {
    const r = body(new Error('secret db password leaked'));
    expect(r).toMatchObject({ statusCode: 500, code: 'internal_error' });
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});
