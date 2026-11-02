export interface Config {
  PORT: number;
  NODE_ENV: 'development' | 'production';

  /**
   * Cookie secret
   */
  COOKIE_SECRET: string;

  /**
   * Health check options
   */
  HEALTH_CHECK_ENABLED?: boolean;

  /**
   * Throttler options
   */
  THROTTLE_GLOBAL_TTL?: number;
  THROTTLE_GLOBAL_LIMIT?: number;

  /**
   * PostgreSQL database options
   */
  POSTGRES_HOST: string;
  POSTGRES_PORT: number;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  POSTGRES_SYNCHRONIZE?: boolean;
  POSTGRES_LOGGING?: boolean;
  POSTGRES_MIGRATIONS_RUN?: boolean;

  /**
   * Cryptographic secrets (>= 32 bytes each)
   */
  JWT_ACCESS_SECRET: string;
  JWT_REFRESH_SECRET: string;
  LOGIN_CHALLENGE_HMAC_KEY: string;

  /**
   * JWT claims
   */
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;

  /**
   * Email confirmation flags
   */
  REGISTRATION_EMAIL_CONFIRMATION_ENABLED?: boolean;
  LOGIN_EMAIL_CONFIRMATION_ENABLED?: boolean;

  /**
   * RBAC
   */
  RBAC_BOOTSTRAP_ADMIN_USER_ID?: string;

  /**
   * CSRF: comma-separated whitelist of allowed origins
   */
  CSRF_ALLOWED_ORIGINS: string;

  /**
   * SMTP
   */
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;

  /**
   * File storage
   */
  STORAGE_DRIVER: 'local' | 's3';
  STORAGE_LOCAL_DIR?: string;
  S3_ENDPOINT?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_FORCE_PATH_STYLE?: boolean;

  /**
   * File size limits (bytes)
   */
  AVATAR_MAX_FILE_SIZE_BYTES?: number;
  CONVERT_MAX_FILE_SIZE_BYTES?: number;
}
