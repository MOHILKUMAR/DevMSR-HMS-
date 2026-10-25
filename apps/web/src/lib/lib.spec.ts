import { loginRequestSchema } from '@devmsr/validation';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, errorMessageKey } from './api/errors';
import { readCookie, readCsrfToken } from './cookies';
import { zodResolver } from './forms';
import { formatDateTime, formatPaise } from './format';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps a path on this site', () => {
    expect(safeRedirectPath('/patients')).toBe('/patients');
  });

  it('refuses other sites, protocol-relative URLs and odd values', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', 'patients', undefined, ['/a', '/b']]) {
      expect(safeRedirectPath(next)).toBe('/');
    }
  });

  it('never sends staff back to the login screen', () => {
    expect(safeRedirectPath('/login')).toBe('/');
  });
});

describe('cookies', () => {
  it('reads a cookie and the CSRF token under either name', () => {
    expect(readCookie('a=1; hms_theme=dark; b=2', 'hms_theme')).toBe('dark');
    expect(readCsrfToken('x=1; hms_csrf=abc.def')).toBe('abc.def');
    expect(readCsrfToken('__Secure-hms_csrf=prod.token')).toBe('prod.token');
    expect(readCsrfToken('hms_theme=dark')).toBeUndefined();
  });
});

describe('errorMessageKey', () => {
  it('maps known API error codes to their own message', () => {
    expect(errorMessageKey(new ApiRequestError({ error: { code: 'LOGIN_FAILED', message: 'x' } }))).toBe('LOGIN_FAILED');
    expect(errorMessageKey(new ApiRequestError({ error: { code: 'RATE_LIMITED', message: 'x' } }))).toBe('RATE_LIMITED');
  });

  it('never shows raw text: unknown codes and errors get the generic message', () => {
    expect(errorMessageKey(new ApiRequestError({ error: { code: 'SOMETHING_NEW', message: 'stack trace here' } }))).toBe('unknown');
    expect(errorMessageKey(new ApiRequestError('not json'))).toBe('unknown');
    expect(errorMessageKey(new Error('boom'))).toBe('unknown');
    expect(errorMessageKey(null)).toBe('unknown');
  });

  it('treats a failed fetch as a connection problem', () => {
    expect(errorMessageKey(new TypeError('Failed to fetch'))).toBe('network');
  });
});

describe('zodResolver', () => {
  const resolve = zodResolver(loginRequestSchema);
  const options = { fields: {}, shouldUseNativeValidation: false } as never;

  it('returns the parsed values, using the same rules as the API', async () => {
    const result = await resolve({ username: '  Reception ', password: 'x' }, undefined, options);
    expect(result.values).toEqual({ username: 'reception', password: 'x' });
  });

  it('marks failing fields without Zod wording', async () => {
    const result = await resolve({ username: '', password: '' }, undefined, options);
    expect(Object.keys(result.errors).sort()).toEqual(['password', 'username']);
    expect(result.errors.username?.message).toBe('');
  });
});

describe('format', () => {
  it('shows date and time in IST as "25 Oct 2026, 12:28 pm"', () => {
    expect(formatDateTime('2026-10-25T06:58:43Z')).toBe('25 Oct 2026, 12:28 pm');
    expect(formatDateTime(new Date('2026-10-24T18:30:00Z'))).toBe('25 Oct 2026, 12:00 am');
  });

  it('shows paise as rupees in the Indian format without floating point', () => {
    expect(formatPaise(12_345_600n)).toBe('₹1,23,456.00');
    expect(formatPaise(5)).toBe('₹0.05');
    expect(formatPaise(-150)).toBe('-₹1.50');
    expect(formatPaise(900_719_925_474_099_199n)).toBe('₹9,00,71,99,25,47,40,991.99');
  });
});
