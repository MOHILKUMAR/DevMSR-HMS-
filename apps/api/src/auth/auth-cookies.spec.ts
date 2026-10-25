import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../common/config/env.js';
import { AuthCookies } from './auth-cookies.js';

function setCookies(env: Partial<Env>) {
  const cookie = vi.fn();
  const cookies = new AuthCookies(env as Env);
  cookies.setSession({ cookie } as unknown as Response, 'session-token');
  cookies.setCsrf({ cookie } as unknown as Response, 'csrf-token');
  return { cookies, calls: cookie.mock.calls as [string, string, Record<string, unknown>][] };
}

describe('AuthCookies', () => {
  it('uses __Secure- names and Secure cookies in production, shared through COOKIE_DOMAIN', () => {
    const { cookies, calls } = setCookies({ NODE_ENV: 'production', COOKIE_DOMAIN: '.devmsr.in' });
    expect(cookies.sessionName).toBe('__Secure-hms_session');
    expect(cookies.csrfName).toBe('__Secure-hms_csrf');
    for (const [, , options] of calls) {
      expect(options).toMatchObject({ secure: true, sameSite: 'lax', path: '/', domain: '.devmsr.in' });
      expect(options).not.toHaveProperty('maxAge');
    }
  });

  it('keeps the session cookie away from JavaScript but lets the web app read the CSRF cookie', () => {
    const { calls } = setCookies({ NODE_ENV: 'production' });
    expect(calls[0]?.[2]).toMatchObject({ httpOnly: true });
    expect(calls[1]?.[2]).toMatchObject({ httpOnly: false });
  });

  it('uses plain names and no domain on localhost', () => {
    const { cookies, calls } = setCookies({ NODE_ENV: 'development' });
    expect(cookies.sessionName).toBe('hms_session');
    expect(calls[0]?.[2]).not.toHaveProperty('domain');
    expect(calls[0]?.[2]).toMatchObject({ secure: false });
  });
});
