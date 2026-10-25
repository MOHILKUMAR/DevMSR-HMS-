import { describe, expect, it } from 'vitest';
import { changeOwnPasswordSchema, loginPasswordChangeSchema, loginRequestSchema, loginResponseSchema, loginTotpSchema, totpCodeBodySchema } from './auth.js';

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

describe('two-factor codes', () => {
  it('takes 6 digits, ignoring the space apps show in the middle', () => {
    expect(totpCodeBodySchema.parse({ code: '123 456' })).toEqual({ code: '123456' });
    expect(totpCodeBodySchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(totpCodeBodySchema.safeParse({ code: '12345a' }).success).toBe(false);
  });

  it('takes either an app code or a recovery code at sign-in, never both or neither', () => {
    expect(loginTotpSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(loginTotpSchema.safeParse({ recoveryCode: '7KQ2-M9XD-4TPA' }).success).toBe(true);
    expect(loginTotpSchema.safeParse({ code: '123456', recoveryCode: '7KQ2-M9XD-4TPA' }).success).toBe(false);
    expect(loginTotpSchema.safeParse({}).success).toBe(false);
  });
});

describe('password changes', () => {
  it('needs a new password of at least 10 characters', () => {
    expect(loginPasswordChangeSchema.safeParse({ newPassword: 'short' }).success).toBe(false);
    expect(changeOwnPasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'a-long-new-one' }).success).toBe(true);
    expect(changeOwnPasswordSchema.safeParse({ currentPassword: '', newPassword: 'a-long-new-one' }).success).toBe(false);
  });
});
