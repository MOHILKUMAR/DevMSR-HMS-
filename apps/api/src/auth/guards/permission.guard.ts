import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Errors } from '../../common/errors/app-error.js';
import { getRequest } from '../../common/http/app-request.js';
import { IS_PUBLIC, REQUIRED_PERMISSION } from '../decorators.js';

/**
 * Pipeline step 6. Denied by default: a route needs `@Public()` or `@RequirePermission(code)`, and the
 * signed-in user must hold that code. Startup also refuses routes without either decorator.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true) {
      return true;
    }
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRED_PERMISSION, targets);
    if (required === undefined) {
      throw Errors.permissionDenied();
    }
    const auth = getRequest(ctx).auth;
    if (auth === undefined) {
      throw Errors.unauthenticated();
    }
    if (!auth.permissions.has(required)) {
      throw Errors.permissionDenied();
    }
    return true;
  }
}
