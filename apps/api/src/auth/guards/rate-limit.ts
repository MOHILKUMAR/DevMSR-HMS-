import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { Response } from 'express';
import type { Env } from '../../common/config/env.js';
import { sha256Hex } from '../../common/crypto/tokens.js';
import { Errors } from '../../common/errors/app-error.js';
import { EXPORT_RATE_LIMIT, LOGIN_RATE_LIMIT } from '../decorators.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

function readCookie(req: Record<string, unknown>, name: string): string | undefined {
  const cookies = req['cookies'] as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Pipeline step 3. Three limits, starting values in env:
 * - api: per signed-in session (one per user in practice), else per IP. Counted across all routes, so a
 *   hospital behind one NAT address is not limited as a whole.
 * - login: per username and IP, on routes marked `@LoginRateLimit()`.
 * - export: per signed-in session, per hour, on exports and PDFs marked `@ExportRateLimit()`.
 */
export function rateLimitOptions(env: Env, sessionCookieName: string): ThrottlerModuleOptions {
  return {
    // Retry-After is set by RateLimitGuard. Per-limit headers would only help an attacker tune requests.
    setHeaders: false,
    throttlers: [
      {
        name: 'api',
        ttl: MINUTE_MS,
        limit: env.RATE_LIMIT_API_PER_MINUTE,
        getTracker: (req) => {
          const token = readCookie(req, sessionCookieName);
          return token === undefined ? `ip:${String(req['ip'])}` : `session:${sha256Hex(token)}`;
        },
        generateKey: (_ctx, tracker, name) => `${name}:${tracker}`,
      },
      {
        name: 'login',
        ttl: MINUTE_MS,
        limit: env.RATE_LIMIT_LOGIN_PER_MINUTE,
        skipIf: (ctx: ExecutionContext) => Reflect.getMetadata(LOGIN_RATE_LIMIT, ctx.getHandler()) !== true,
        getTracker: (req) => {
          const body = req['body'] as Record<string, unknown> | undefined;
          const username = typeof body?.['username'] === 'string' ? body['username'].trim().toLowerCase() : '';
          return `${String(req['ip'])}|${username}`;
        },
        generateKey: (_ctx, tracker, name) => `${name}:${sha256Hex(tracker)}`,
      },
      {
        name: 'export',
        ttl: HOUR_MS,
        limit: env.RATE_LIMIT_EXPORT_PER_HOUR,
        skipIf: (ctx: ExecutionContext) => Reflect.getMetadata(EXPORT_RATE_LIMIT, ctx.getHandler()) !== true,
        getTracker: (req) => {
          const token = readCookie(req, sessionCookieName);
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
