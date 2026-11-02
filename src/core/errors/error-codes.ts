export enum ErrorCode {
  BadRequest = 'bad_request',
  InvalidSession = 'invalid_session',
  InvalidCredentials = 'invalid_credentials',
  PermissionDenied = 'permission_denied',
  OwnershipDenied = 'ownership_denied',
  CsrfRejected = 'csrf_rejected',
  NotFound = 'not_found',
  Conflict = 'conflict',
  PayloadTooLarge = 'payload_too_large',
  UnsupportedMediaType = 'unsupported_media_type',
  RateLimitExceeded = 'rate_limit_exceeded',
  AuthorizationUnavailable = 'authorization_unavailable',
  ServiceUnavailable = 'service_unavailable',
  GatewayTimeout = 'gateway_timeout',
  InternalError = 'internal_error',
}

/** Default code for a status when the exception carries no explicit one. */
export const DEFAULT_CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: ErrorCode.BadRequest,
  401: ErrorCode.InvalidSession,
  403: ErrorCode.PermissionDenied,
  404: ErrorCode.NotFound,
  409: ErrorCode.Conflict,
  413: ErrorCode.PayloadTooLarge,
  415: ErrorCode.UnsupportedMediaType,
  429: ErrorCode.RateLimitExceeded,
  503: ErrorCode.ServiceUnavailable,
  504: ErrorCode.GatewayTimeout,
};

/** Allowed (status, code) pairs per the spec table. */
export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ErrorCode.BadRequest]: 400,
  [ErrorCode.InvalidSession]: 401,
  [ErrorCode.InvalidCredentials]: 401,
  [ErrorCode.PermissionDenied]: 403,
  [ErrorCode.OwnershipDenied]: 403,
  [ErrorCode.CsrfRejected]: 403,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.Conflict]: 409,
  [ErrorCode.PayloadTooLarge]: 413,
  [ErrorCode.UnsupportedMediaType]: 415,
  [ErrorCode.RateLimitExceeded]: 429,
  [ErrorCode.AuthorizationUnavailable]: 503,
  [ErrorCode.ServiceUnavailable]: 503,
  [ErrorCode.GatewayTimeout]: 504,
  [ErrorCode.InternalError]: 500,
};
