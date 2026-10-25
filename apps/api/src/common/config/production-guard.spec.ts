import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

/** A production environment with nothing wrong, except the adapters, which have no real versions yet. */
const production = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  DATABASE_URL: 'postgresql://hms_app:Xr7q2PzLw9@db.example.in:5432/postgres',
  DIRECT_URL: 'postgresql://postgres:Mv4kT8sQy1@db.example.in:5432/postgres',
  SESSION_SECRET: randomBytes(32).toString('base64'),
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  CORS_ORIGINS: 'https://app.example.in',
  SENTRY_DSN: 'https://key@o1.ingest.sentry.io/1',
  JOBS_DATABASE_URL: 'postgresql://hms_jobs:Qw3nB7vRt5@db.example.in:5432/postgres',
};

function problems(overrides: Record<string, string> = {}): string {
  try {
    loadEnv({ ...production, ...overrides });
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('production start-up guard', () => {
  it('refuses mock adapters, which is every adapter until the real ones are built', () => {
    const message = problems();
    expect(message).toContain('Refusing to start in production');
    for (const key of ['PAYMENTS_PROVIDER', 'WHATSAPP_PROVIDER', 'SMS_PROVIDER', 'EMAIL_PROVIDER']) {
      expect(message).toContain(`${key} uses the mock adapter`);
    }
    expect(problems({ ABDM_MODE: 'mock' })).toContain('ABDM_MODE uses the mock adapter');
    expect(problems()).not.toContain('ABDM_MODE');
  });

  it('refuses background jobs without their own login', () => {
    expect(problems({ JOBS_DATABASE_URL: '' })).toContain('JOBS_DATABASE_URL is not set');
    expect(problems({ JOBS_DATABASE_URL: '', JOBS_ENABLED: 'false' })).not.toContain('JOBS_DATABASE_URL');
    expect(problems({ JOBS_DATABASE_URL: 'postgresql://hms_app:Qw3nB7vRt5@db.example.in:5432/postgres' })).toContain('JOBS_DATABASE_URL uses the API login');
    expect(problems()).not.toContain('JOBS_DATABASE_URL');
  });

  it('refuses a missing Sentry DSN', () => {
    expect(problems({ SENTRY_DSN: '' })).toContain('SENTRY_DSN is not set');
    expect(problems()).not.toContain('SENTRY_DSN');
  });

  it('refuses demo and placeholder secrets', () => {
    const placeholder = Buffer.alloc(32, 'a').toString('base64');
    expect(problems({ SESSION_SECRET: placeholder })).toContain('SESSION_SECRET looks like a placeholder');
    expect(problems({ FIELD_ENCRYPTION_KEY: placeholder })).toContain('FIELD_ENCRYPTION_KEY looks like a placeholder');
    expect(problems({ SESSION_SECRET: production.FIELD_ENCRYPTION_KEY })).toContain('are the same value');
    expect(problems({ DATABASE_URL: 'postgresql://hms:hms_local_only@localhost:5432/hms' })).toContain('DATABASE_URL uses the local or CI demo password');
    expect(problems({ DIRECT_URL: 'postgresql://hms:hms_ci_only@localhost:5432/hms' })).toContain('DIRECT_URL uses the local or CI demo password');
    expect(problems({ SEED_USER_PASSWORD: 'anything' })).toContain('SEED_USER_PASSWORD is set');
    expect(problems({ SEED_TOTP_SECRET: 'JBSWY3DPEHPK3PXP' })).toContain('SEED_TOTP_SECRET is set');
    expect(problems()).not.toMatch(/placeholder|demo password|SEED_USER_PASSWORD|same value/);
  });

  it('refuses plain http origins', () => {
    expect(problems({ CORS_ORIGINS: 'https://app.example.in,http://app.example.in' })).toContain('CORS_ORIGINS must list https:// origins only');
  });

  it('never prints a secret', () => {
    const secret = Buffer.alloc(32, 'z').toString('base64');
    const message = problems({ SESSION_SECRET: secret, DATABASE_URL: 'postgresql://hms:hms_local_only@localhost:5432/hms' });
    expect(message).not.toContain(secret);
    expect(message).not.toContain('hms_local_only');
  });

  it('leaves staging alone, so it can keep mock adapters', () => {
    expect(problems({ APP_ENV: 'staging', SENTRY_DSN: '', SEED_USER_PASSWORD: 'x' })).toBe('');
  });
});
