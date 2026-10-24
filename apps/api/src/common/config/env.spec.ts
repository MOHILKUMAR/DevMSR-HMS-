import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const required = {
  DATABASE_URL: 'postgresql://hms:hms@localhost:5432/hms',
  SESSION_SECRET: randomBytes(32).toString('base64'),
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

describe('loadEnv', () => {
  it('applies defaults for local development', () => {
    const env = loadEnv(required);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGINS: ['http://localhost:3000'],
      LOG_LEVEL: 'info',
      TRUST_PROXY: 'loopback',
      RATE_LIMIT_LOGIN_PER_MINUTE: 5,
      RATE_LIMIT_API_PER_MINUTE: 300,
    });
    expect(env.COOKIE_DOMAIN).toBeUndefined();
  });

  it('splits and trims a comma separated CORS list', () => {
    expect(loadEnv({ ...required, CORS_ORIGINS: 'https://app.example.in, https://staging.example.in,' }).CORS_ORIGINS).toEqual([
      'https://app.example.in',
      'https://staging.example.in',
    ]);
  });

  it('requires the database URL and both secrets', () => {
    expect(() => loadEnv({})).toThrow('Invalid environment variables: DATABASE_URL, SESSION_SECRET, FIELD_ENCRYPTION_KEY');
  });

  it('rejects a field encryption key that is not exactly 32 bytes', () => {
    expect(() => loadEnv({ ...required, FIELD_ENCRYPTION_KEY: randomBytes(16).toString('base64') })).toThrow(
      'FIELD_ENCRYPTION_KEY',
    );
  });

  it('names the invalid keys without echoing their values', () => {
    expect(() => loadEnv({ ...required, PORT: 'not-a-port', LOG_LEVEL: 'loud' })).toThrow(
      'Invalid environment variables: PORT, LOG_LEVEL',
    );
    expect(() => loadEnv({ ...required, SESSION_SECRET: 'tiny' })).not.toThrow(/tiny/);
  });
});
