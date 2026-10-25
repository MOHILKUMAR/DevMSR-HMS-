import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from './auth.js';

describe('loginRequestSchema', () => {
  it('trims and lowercases the username', () => {
    expect(loginRequestSchema.parse({ username: '  Reception1 ', password: 'x' }).username).toBe('reception1');
  });

  it('rejects an empty password and an oversized one', () => {
    expect(loginRequestSchema.safeParse({ username: 'a', password: '' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ username: 'a', password: 'p'.repeat(257) }).success).toBe(false);
  });

  it('rejects a missing username', () => {
    expect(loginRequestSchema.safeParse({ password: 'x' }).success).toBe(false);
  });
});
