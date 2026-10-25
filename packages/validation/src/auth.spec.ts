import { describe, expect, it } from 'vitest';
import { changeOwnPasswordSchema, loginPasswordChangeSchema, loginRequestSchema, loginResponseSchema } from './auth.js';

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

describe('loginResponseSchema', () => {
  it('reads a challenge without any profile or token', () => {
    const challenge = { status: 'challenge', step: 'change_password', expiresAt: '2026-10-25T10:00:00.000Z', csrfToken: 'x' };
    expect(loginResponseSchema.parse(challenge)).toEqual({ status: 'challenge', step: 'change_password', expiresAt: '2026-10-25T10:00:00.000Z' });
  });

  it('rejects an unknown status', () => {
    expect(loginResponseSchema.safeParse({ status: 'maybe' }).success).toBe(false);
  });
});

describe('password changes', () => {
  it('needs a new password of at least 10 characters', () => {
    expect(loginPasswordChangeSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
    expect(changeOwnPasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'a-long-new-one' }).success).toBe(true);
    expect(changeOwnPasswordSchema.safeParse({ currentPassword: '', newPassword: 'a-long-new-one' }).success).toBe(false);
  });
});
