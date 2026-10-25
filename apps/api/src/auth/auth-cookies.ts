import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ENV, type Env } from '../common/config/env.js';
import type { AppRequest } from '../common/http/app-request.js';

export const CSRF_HEADER = 'x-csrf-token';

export function authCookieNames(env: Env): { session: string; csrf: string } {
  return env.NODE_ENV === 'production'
    ? { session: '__Secure-hms_session', csrf: '__Secure-hms_csrf' }
    : { session: 'hms_session', csrf: 'hms_csrf' };
}

/**
 * Cookie names and options in one place. In production the names carry the __Secure- prefix, so the
 * browser only accepts them over HTTPS. Neither cookie has Max-Age: both end when the browser closes,
 * which matters on shared counter computers. The server still enforces the 15 minute idle and 12 hour limits.
 */
@Injectable()
export class AuthCookies {
  readonly sessionName: string;
  readonly csrfName: string;
  private readonly base: CookieOptions;

  constructor(@Inject(ENV) env: Env) {
    const names = authCookieNames(env);
    this.sessionName = names.session;
    this.csrfName = names.csrf;
    this.base = {
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // Shared by the app. and api. hosts, so Next.js can see the session cookie.
      ...(env.COOKIE_DOMAIN === undefined || env.COOKIE_DOMAIN === '' ? {} : { domain: env.COOKIE_DOMAIN }),
    };
  }

  sessionToken(req: AppRequest): string | undefined {
    return this.read(req, this.sessionName);
  }

  csrfToken(req: AppRequest): string | undefined {
    return this.read(req, this.csrfName);
  }

  setSession(res: Response, token: string): void {
    res.cookie(this.sessionName, token, { ...this.base, httpOnly: true });
  }

  /** Readable by the web app's JavaScript, which echoes it in the X-CSRF-Token header. */
  setCsrf(res: Response, token: string): void {
    res.cookie(this.csrfName, token, { ...this.base, httpOnly: false });
  }

  clear(res: Response): void {
    res.clearCookie(this.sessionName, { ...this.base, httpOnly: true });
    res.clearCookie(this.csrfName, { ...this.base, httpOnly: false });
  }

  private read(req: AppRequest, name: string): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[name];
    return typeof value === 'string' && value !== '' ? value : undefined;
  }
}
