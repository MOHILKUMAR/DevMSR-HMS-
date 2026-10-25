import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { ENV, type Env } from '../common/config/env.js';
import type { AppRequest } from '../common/http/app-request.js';

export const CSRF_HEADER = 'x-csrf-token';
/** The login challenge cookie is only ever sent to the sign-in routes. */
export const LOGIN_CHALLENGE_PATH = '/api/v1/auth/login';
/** How long a user has to finish the steps after a correct password. */
export const LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000;

export interface AuthCookieNames {
  session: string;
  csrf: string;
  challenge: string;
}

export function authCookieNames(env: Env): AuthCookieNames {
  return env.NODE_ENV === 'production'
    ? { session: '__Secure-hms_session', csrf: '__Secure-hms_csrf', challenge: '__Secure-hms_login' }
    : { session: 'hms_session', csrf: 'hms_csrf', challenge: 'hms_login' };
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
  readonly challengeName: string;
  private readonly base: CookieOptions;
  private readonly challenge: CookieOptions;

  constructor(@Inject(ENV) env: Env) {
    const names = authCookieNames(env);
    this.sessionName = names.session;
    this.csrfName = names.csrf;
    this.challengeName = names.challenge;
    this.base = {
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      // Shared by the app. and api. hosts, so Next.js can see the session cookie.
      ...(env.COOKIE_DOMAIN === undefined || env.COOKIE_DOMAIN === '' ? {} : { domain: env.COOKIE_DOMAIN }),
    };
    // Host-only and limited to the sign-in routes: the web app never needs to see it.
    this.challenge = {
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: LOGIN_CHALLENGE_PATH,
      httpOnly: true,
    };
  }

  sessionToken(req: AppRequest): string | undefined {
    return this.read(req, this.sessionName);
  }

  csrfToken(req: AppRequest): string | undefined {
    return this.read(req, this.csrfName);
  }

  challengeToken(req: AppRequest): string | undefined {
    return this.read(req, this.challengeName);
  }

  setChallenge(res: Response, token: string): void {
    res.cookie(this.challengeName, token, { ...this.challenge, maxAge: LOGIN_CHALLENGE_TTL_MS });
  }

  clearChallenge(res: Response): void {
    res.clearCookie(this.challengeName, this.challenge);
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
