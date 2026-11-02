import { configValidationSchema } from './config.validation';

const valid = {
  PORT: '3007',
  NODE_ENV: 'development',
  COOKIE_SECRET: 's',
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5432',
  POSTGRES_USER: 'u',
  POSTGRES_PASSWORD: 'p',
  POSTGRES_DB: 'd',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  LOGIN_CHALLENGE_HMAC_KEY: 'c'.repeat(32),
  JWT_ISSUER: 'iss',
  JWT_AUDIENCE: 'aud',
  CSRF_ALLOWED_ORIGINS: 'http://localhost:4200',
  STORAGE_DRIVER: 'local',
};

describe('configValidationSchema', () => {
  const run = (over: Record<string, unknown> = {}) =>
    configValidationSchema.validate({ ...valid, ...over });

  it('accepts a valid env', () => {
    expect(run().error).toBeUndefined();
  });

  it.each([
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'LOGIN_CHALLENGE_HMAC_KEY',
  ])('rejects missing or short %s', (key) => {
    expect(run({ [key]: undefined }).error).toBeDefined();
    expect(run({ [key]: 'x'.repeat(31) }).error).toBeDefined();
    expect(run({ [key]: 'x'.repeat(32) }).error).toBeUndefined();
  });

  it('requires S3 settings when STORAGE_DRIVER=s3', () => {
    expect(run({ STORAGE_DRIVER: 's3' }).error).toBeDefined();
  });

  it('requires SMTP when email confirmation is enabled', () => {
    expect(
      run({ REGISTRATION_EMAIL_CONFIRMATION_ENABLED: 'true' }).error,
    ).toBeDefined();
    expect(
      run({
        LOGIN_EMAIL_CONFIRMATION_ENABLED: 'true',
        SMTP_HOST: 'h',
        SMTP_FROM: 'a@b.c',
      }).error,
    ).toBeUndefined();
  });
});
