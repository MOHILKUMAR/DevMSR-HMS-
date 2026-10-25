import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../../auth/auth-context.js';

/** Input after the contract's Zod schemas parsed it. Handlers read this, never the raw request. */
export interface ValidatedInput {
  body?: unknown;
  query?: unknown;
  params?: unknown;
}

export interface AppRequest extends Request {
  /** Request ID set by the logging middleware and echoed in X-Request-Id. */
  id: string;
  /** Set by the session guard when the request carries a valid session. */
  auth?: AuthContext;
  validated?: ValidatedInput;
}

/** Who and where a request came from, for audit and login records. */
export interface RequestMeta {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export function requestMeta(req: AppRequest): RequestMeta {
  return {
    requestId: req.id,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 512) ?? null,
  };
}

export function getRequest(ctx: ExecutionContext): AppRequest {
  return ctx.switchToHttp().getRequest<AppRequest>();
}

/** `@ReqMeta() meta: RequestMeta` */
export const ReqMeta = createParamDecorator((_data: unknown, ctx: ExecutionContext) => requestMeta(getRequest(ctx)));
