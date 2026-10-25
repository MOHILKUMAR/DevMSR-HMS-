import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../../common/errors/app-error.js';
import { getRequest } from '../../common/http/app-request.js';
import { AuthCookies } from '../auth-cookies.js';
import { IS_PUBLIC } from '../decorators.js';
import { SessionsService } from '../sessions.service.js';

/**
 * Pipeline step 4. Reads the session cookie and sets `req.auth`.
 * Protected routes reject a missing, unknown, revoked or expired session with 401.
 * Public routes still pick up a valid session (so CSRF tokens bind to it) but never reject.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cookies: AuthCookies,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = getRequest(ctx);
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]) === true;
    const token = this.cookies.sessionToken(req);

    if (token === undefined) {
      if (isPublic) return true;
      throw Errors.unauthenticated();
    }

    const result = await this.sessions.check(token);
    if (result.status === 'valid') {
      req.auth = result.auth;
      return true;
    }
    if (isPublic) return true;
    throw result.status === 'expired' ? Errors.sessionExpired() : Errors.unauthenticated();
  }
}
