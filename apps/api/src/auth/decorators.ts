import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Errors } from '../common/errors/app-error.js';
import { getRequest } from '../common/http/app-request.js';
import type { AuthContext } from './auth-context.js';
import type { PermissionCode } from './permission-matrix.js';

export const IS_PUBLIC = 'auth:public';
export const REQUIRED_PERMISSION = 'auth:permission';
export const LOGIN_RATE_LIMIT = 'auth:loginRateLimit';

/**
 * Opens a route to anyone. Every use must be reviewed: routes are denied by default, and a route
 * without `@Public()` or `@RequirePermission()` stops the API from starting.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** The permission code the signed-in user needs for this route. */
export const RequirePermission = (code: PermissionCode) => SetMetadata(REQUIRED_PERMISSION, code);

/** Applies the login limit (per username and IP) on top of the general limit. */
export const LoginRateLimit = () => SetMetadata(LOGIN_RATE_LIMIT, true);

/** `@CurrentAuth() auth: AuthContext` on routes that require a permission. */
export const CurrentAuth = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthContext => {
  const auth = getRequest(ctx).auth;
  if (auth === undefined) {
    throw Errors.unauthenticated();
  }
  return auth;
});
