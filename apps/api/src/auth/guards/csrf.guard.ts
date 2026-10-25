import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { safeEqual } from '../../common/crypto/tokens.js';
import { Errors } from '../../common/errors/app-error.js';
import { getRequest } from '../../common/http/app-request.js';
import { AuthCookies, CSRF_HEADER } from '../auth-cookies.js';
import { CsrfService } from '../csrf.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Pipeline step 5. Every POST, PUT, PATCH and DELETE, login included, must send the CSRF cookie's
 * value in the X-CSRF-Token header, signed for the current session (or for no session before sign-in).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly csrf: CsrfService,
    private readonly cookies: AuthCookies,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = getRequest(ctx);
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }
    const cookieToken = this.cookies.csrfToken(req);
    const headerToken = req.get(CSRF_HEADER);
    if (
      cookieToken === undefined ||
      headerToken === undefined ||
      !safeEqual(cookieToken, headerToken) ||
      !this.csrf.verify(headerToken, req.auth?.sessionId ?? null)
    ) {
      throw Errors.csrfFailed();
    }
    return true;
  }
}
