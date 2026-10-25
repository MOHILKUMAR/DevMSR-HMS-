import { describe, expect, it } from 'vitest';
import { newPasswordFormSchema } from '../auth/new-password-form';
import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  it('names the browser and system staff will recognise', () => {
    expect(
      describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'),
    ).toBe('Chrome on Windows');
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge on Windows');
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36')).toBe(
      'Chrome on Android',
    );
    expect(describeUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe(
      'Safari on macOS',
    );
  });

  it('returns null when the device is unknown', () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent('curl/8.0')).toBeNull();
  });
});

describe('newPasswordFormSchema', () => {
  it('needs 10 characters and a matching confirmation', () => {
    expect(newPasswordFormSchema.safeParse({ newPassword: 'long-enough-1', confirm: 'long-enough-1' }).success).toBe(true);
    expect(newPasswordFormSchema.safeParse({ newPassword: 'short', confirm: 'short' }).success).toBe(false);
    const mismatch = newPasswordFormSchema.safeParse({ newPassword: 'long-enough-1', confirm: 'long-enough-2' });
    expect(mismatch.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['confirm']);
  });
});
