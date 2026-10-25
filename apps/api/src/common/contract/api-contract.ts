import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { ZodType } from 'zod';
import { getRequest } from '../http/app-request.js';

/**
 * The contract of one route: input schemas, the exact response shape and the OpenAPI summary.
 * Every route has one (checked at startup). Input is validated before the handler runs, and the
 * response is parsed through `response` so only the listed fields ever leave the API.
 */
export interface ApiContractOptions {
  summary: string;
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
  /** Omit for routes that return 204 No Content. */
  response?: ZodType;
  /** For a file download such as a CSV; JSON when left out. The handler sets the header itself. */
  contentType?: 'text/csv';
}

export const API_CONTRACT = 'api:contract';

export const ApiContract = (options: ApiContractOptions) => SetMetadata(API_CONTRACT, options);

/** The body after validation. Its type matches the contract's `body` schema. */
export const ValidBody = createParamDecorator((_data: unknown, ctx: ExecutionContext): unknown => getRequest(ctx).validated?.body);

/** The query after validation. Its type matches the contract's `query` schema. */
export const ValidQuery = createParamDecorator((_data: unknown, ctx: ExecutionContext): unknown => getRequest(ctx).validated?.query);

/** Route params after validation. Their type matches the contract's `params` schema. */
export const ValidParams = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): unknown => getRequest(ctx).validated?.params,
);
