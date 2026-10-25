import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies defaults for local development', () => {
    expect(loadEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      CORS_ORIGINS: ['http://localhost:3000'],
      LOG_LEVEL: 'info',
    });
  });

  it('splits and trims a comma separated CORS list', () => {
    expect(loadEnv({ CORS_ORIGINS: 'https://app.example.in, https://staging.example.in,' }).CORS_ORIGINS).toEqual([
      'https://app.example.in',
      'https://staging.example.in',
    ]);
  });

  it('names the invalid keys without echoing their values', () => {
    expect(() => loadEnv({ PORT: 'not-a-port', LOG_LEVEL: 'loud' })).toThrow(
      'Invalid environment variables: PORT, LOG_LEVEL',
    );
    expect(() => loadEnv({ PORT: 'not-a-port' })).not.toThrow(/not-a-port/);
  });
});
