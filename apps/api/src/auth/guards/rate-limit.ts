import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Env } from '../../common/config/env.js';
import { sha256Hex } from '../../common/crypto/tokens.js';
import { Errors } from '../../common/errors/app-error.js';
import type { AuthCookieNames } from '../auth-cookies.js';
import { EXPORT_RATE_LIMIT, LOGIN_RATE_LIMIT, PASSWORD_RATE_LIMIT } from '../decorators.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function readCookie(req: Record<string, unknown>, name: string): string | undefined {
  const cookies = req['cookies'] as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function marked(ctx: ExecutionContext, key: string): boolean {
  return Reflect.getMetadata(key, ctx.getHandler()) === true;
}

/**
 * Pipeline step 3. Four limits, starting values in env:
 * - api: per signed-in session (one per user in practice), else per IP. Counted across all routes, so a
 *   hospital behind one NAT address is not limited as a whole.
 * - login: per username and IP, on routes marked `@LoginRateLimit()`. Two-factor code routes send no
 *   username, so they count per login challenge, or per session in My account.
 * - password: per account whose password is set or changed, on routes marked `@PasswordRateLimit()`.
 *   The rate limiter runs before the session is read, so the account is the route's `:id` when an
 *   admin sets it, else the session or login challenge cookie it came from.
 * - export: per signed-in session, per hour, on exports and PDFs marked `@ExportRateLimit()`.
 */
export function rateLimitOptions(env: Env, cookies: AuthCookieNames): ThrottlerModuleOptions {
  return {
    // Retry-After is set by RateLimitGuard. Per-limit headers would only help an attacker tune requests.
    setHeaders: false,
    throttlers: [
      {
        name: 'api',
        ttl: MINUTE_MS,
        limit: env.RATE_LIMIT_API_PER_MINUTE,
        getTracker: (req) => {
          const token = readCookie(req, cookies.session);
          return token === undefined ? `ip:${String(req['ip'])}` : `session:${sha256Hex(token)}`;
        },
        generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
      },
      {
        name: 'login',
        ttl: MINUTE_MS,
        limit: env.RATE_LIMIT_LOGIN_PER_MINUTE,
        skipIf: (ctx: ExecutionContext) => !marked(ctx, LOGIN_RATE_LIMIT),
        getTracker: (req) => {
          const body = req['body'] as Record<string, unknown> | undefined;
          if (typeof body?.['username'] === 'string') return `${String(req['ip'])}|${body['username'].trim().toLowerCase()}`;
          const token = readCookie(req, cookies.challenge) ?? readCookie(req, cookies.session);
          return token === undefined ? `${String(req['ip'])}|` : `token:${token}`;
        },
        generateKey: (_ctx, tracker, name) => `${name}:${sha256Hex(tracker)}`,
      },
      {
        name: 'password',
        ttl: HOUR_MS,
        limit: env.RATE_LIMIT_PASSWORD_PER_HOUR,
        skipIf: (ctx: ExecutionContext) => !marked(ctx, PASSWORD_RATE_LIMIT),
        getTracker: (req) => {
          const params = req['params'] as Record<string, unknown> | undefined;
          if (typeof params?.['id'] === 'string') return `user:${params['id']}`;
          const token = readCookie(req, cookies.session) ?? readCookie(req, cookies.challenge);
          return token === undefined ? `ip:${String(req['ip'])}` : `token:${token}`;
        },
        generateKey: (_ctx, tracker, name) => `${name}:${sha256Hex(tracker)}`,
      },
      {
        name: 'export',
        ttl: HOUR_MS,
        limit: env.RATE_LIMIT_EXPORT_PER_HOUR,
        skipIf: (ctx: ExecutionContext) => !marked(ctx, EXPORT_RATE_LIMIT),
        getTracker: (req) => {
          const token = readCookie(req, cookies.session);
          return token === undefined ? `ip:${String(req['ip'])}` : `session:${sha256Hex(token)}`;
        },
        generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
      },
    ],
  };
}

/** Returns 429 with the standard error body and a Retry-After header in seconds. */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected override throwThrottlingException(context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(detail.timeToBlockExpire))));
    return Promise.reject(Errors.rateLimited());
  }
}
