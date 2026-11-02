import Joi from 'joi';

import { Config } from './config.types';

const MIN_SECRET_BYTES = 32;

const secret = () =>
  Joi.string()
    .required()
    .custom((value: string, helpers) =>
      Buffer.byteLength(value, 'utf8') < MIN_SECRET_BYTES
        ? helpers.error('any.invalid')
        : value,
    )
    .messages({
      'any.invalid': `{{#label}} must be at least ${MIN_SECRET_BYTES} bytes`,
    });

const requiredWhen = (key: string, value: string, schema: Joi.Schema) =>
  Joi.when(key, {
    is: value,
    then: schema.required(),
    otherwise: schema.optional(),
  });

export const configValidationSchema = Joi.object<Config>({
  PORT: Joi.number().port().required(),
  NODE_ENV: Joi.string().valid('development', 'production').required(),

  /**
   * Cookie secret
   */
  COOKIE_SECRET: Joi.string().required(),

  /**
   * Health check options
   */
  HEALTH_CHECK_ENABLED: Joi.boolean().optional().default(false),

  /**
   * Throttler options
   */
  THROTTLE_GLOBAL_TTL: Joi.number().optional().default(10000),
  THROTTLE_GLOBAL_LIMIT: Joi.number().optional().default(10),

  /**
   * PostgreSQL database options
   */
  POSTGRES_HOST: Joi.string().hostname().required(),
  POSTGRES_PORT: Joi.number().port().required(),
  POSTGRES_USER: Joi.string().required(),
  POSTGRES_PASSWORD: Joi.string().required(),
  POSTGRES_DB: Joi.string().required(),
  POSTGRES_SYNCHRONIZE: Joi.boolean().optional().default(false),
  POSTGRES_LOGGING: Joi.boolean().optional().default(false),
  POSTGRES_MIGRATIONS_RUN: Joi.boolean().optional().default(false),

  /**
   * Cryptographic secrets (>= 32 bytes each)
   */
  JWT_ACCESS_SECRET: secret(),
  JWT_REFRESH_SECRET: secret(),
  LOGIN_CHALLENGE_HMAC_KEY: secret(),

  /**
   * JWT claims
   */
  JWT_ISSUER: Joi.string().required(),
  JWT_AUDIENCE: Joi.string().required(),

  /**
   * Email confirmation flags
   */
  REGISTRATION_EMAIL_CONFIRMATION_ENABLED: Joi.boolean()
    .optional()
    .default(false),
  REGISTRATION_CONFIRMATION_METHOD: Joi.string()
    .valid('otp', 'magic_link')
    .optional()
    .default('otp'),
  MAGIC_LINK_BASE_URL: Joi.string().uri().optional(),
  LOGIN_EMAIL_CONFIRMATION_ENABLED: Joi.boolean().optional().default(false),

  /**
   * RBAC
   */
  RBAC_BOOTSTRAP_ADMIN_USER_ID: Joi.string().uuid().optional(),

  /**
   * CSRF: comma-separated whitelist of allowed origins
   */
  CSRF_ALLOWED_ORIGINS: Joi.string().required(),

  /**
   * SMTP (required when any email confirmation is enabled)
   */
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().port().optional().default(587),
  SMTP_SECURE: Joi.boolean().optional().default(false),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM: Joi.string().optional(),

  /**
   * File storage
   */
  STORAGE_DRIVER: Joi.string().valid('local', 's3').required(),
  STORAGE_LOCAL_DIR: Joi.string().optional().default('./storage'),
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_REGION: Joi.string().optional(),
  S3_BUCKET: requiredWhen('STORAGE_DRIVER', 's3', Joi.string()),
  S3_ACCESS_KEY_ID: requiredWhen('STORAGE_DRIVER', 's3', Joi.string()),
  S3_SECRET_ACCESS_KEY: requiredWhen('STORAGE_DRIVER', 's3', Joi.string()),
  S3_FORCE_PATH_STYLE: Joi.boolean().optional().default(false),

  /**
   * File size limits (bytes)
   */
  AVATAR_MAX_FILE_SIZE_BYTES: Joi.number()
    .integer()
    .positive()
    .optional()
    .default(5 * 1024 * 1024),
  CONVERT_MAX_FILE_SIZE_BYTES: Joi.number()
    .integer()
    .positive()
    .optional()
    .default(10 * 1024 * 1024),
})
  .when(
    Joi.object({
      REGISTRATION_EMAIL_CONFIRMATION_ENABLED: Joi.boolean()
        .valid(true)
        .required(),
    }).unknown(),
    {
      then: Joi.object({
        SMTP_HOST: Joi.required(),
        SMTP_FROM: Joi.required(),
      }),
    },
  )
  .when(
    Joi.object({
      LOGIN_EMAIL_CONFIRMATION_ENABLED: Joi.boolean().valid(true).required(),
    }).unknown(),
    {
      then: Joi.object({
        SMTP_HOST: Joi.required(),
        SMTP_FROM: Joi.required(),
      }),
    },
  );
