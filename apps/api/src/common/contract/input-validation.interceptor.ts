import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import type { ZodType } from 'zod';
import { Errors } from '../errors/app-error.js';
import { getRequest } from '../http/app-request.js';
import { API_CONTRACT, type ApiContractOptions } from './api-contract.js';

type Location = 'body' | 'query' | 'params';

export interface ValidationIssue {
  location: Location;
  path: string;
  message: string;
}

function parse(schema: ZodType, value: unknown, location: Location): unknown {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Zod messages describe the rule ("expected string"), never the submitted value.
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      location,
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw Errors.validation(issues);
  }
  return result.data;
}

function hasContent(body: unknown): boolean {
  return typeof body === 'object' && body !== null && Object.keys(body).length > 0;
}

/** Pipeline step 7: validates body, query and params against the route contract. Invalid input is a 400. */
@Injectable()
export class InputValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const contract = this.reflector.get<ApiContractOptions | undefined>(API_CONTRACT, ctx.getHandler());
    if (contract !== undefined) {
      const req = getRequest(ctx);
      if (contract.body === undefined && hasContent(req.body)) {
        throw Errors.validation([{ location: 'body', path: '', message: 'This request takes no body.' }]);
      }
      req.validated = {
        body: contract.body === undefined ? undefined : parse(contract.body, req.body, 'body'),
        query: contract.query === undefined ? undefined : parse(contract.query, req.query, 'query'),
        params: contract.params === undefined ? undefined : parse(contract.params, req.params, 'params'),
      };
    }
    return next.handle();
  }
}
