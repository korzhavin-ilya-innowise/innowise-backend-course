import { HttpException } from '@nestjs/common';

import { ErrorCode, STATUS_BY_CODE } from './error-codes';

/**
 * Single exception type for the whole API. HTTP status is derived from `code`
 * so the (status, code) pair always matches the spec table.
 */
export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code, STATUS_BY_CODE[code]);
  }

  static badRequest(message?: string, details?: unknown) {
    return new AppException(ErrorCode.BadRequest, message, details);
  }
  static invalidSession(message?: string) {
    return new AppException(ErrorCode.InvalidSession, message);
  }
  static invalidCredentials() {
    return new AppException(
      ErrorCode.InvalidCredentials,
      'Invalid credentials',
    );
  }
  static permissionDenied(message?: string) {
    return new AppException(ErrorCode.PermissionDenied, message);
  }
  static ownershipDenied(message?: string) {
    return new AppException(ErrorCode.OwnershipDenied, message);
  }
  static csrfRejected(message?: string) {
    return new AppException(ErrorCode.CsrfRejected, message);
  }
  static notFound(message?: string) {
    return new AppException(ErrorCode.NotFound, message);
  }
  static conflict(message?: string) {
    return new AppException(ErrorCode.Conflict, message);
  }
  static payloadTooLarge(message?: string) {
    return new AppException(ErrorCode.PayloadTooLarge, message);
  }
  static unsupportedMediaType(message?: string) {
    return new AppException(ErrorCode.UnsupportedMediaType, message);
  }
  static rateLimitExceeded(message?: string) {
    return new AppException(ErrorCode.RateLimitExceeded, message);
  }
  static authorizationUnavailable(message?: string) {
    return new AppException(ErrorCode.AuthorizationUnavailable, message);
  }
  static serviceUnavailable(message?: string) {
    return new AppException(ErrorCode.ServiceUnavailable, message);
  }
  static gatewayTimeout(message?: string) {
    return new AppException(ErrorCode.GatewayTimeout, message);
  }
}
