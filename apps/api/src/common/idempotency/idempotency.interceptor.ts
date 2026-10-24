import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { catchError, concatMap, from, of, throwError, type Observable } from 'rxjs';
import { sha256Hex } from '../crypto/tokens.js';
import { Errors } from '../errors/app-error.js';
import { getRequest } from '../http/app-request.js';
import { IDEMPOTENT } from './idempotent.decorator.js';
import { IdempotencyRepository } from './idempotency.repository.js';

const KEY_FORMAT = /^[A-Za-z0-9_-]{16,128}$/;
const RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Pipeline step 8, for routes marked `@Idempotent()`.
 * - New key: run the handler and store its response.
 * - Same key, same request, finished: return the stored response with `Idempotent-Replayed: true`.
 * - Same key, different request: 422. Same key still running: 409.
 * If the handler fails, the key is freed. If storing the response fails after the handler succeeded,
 * the key stays "in progress" so a retry can never run the change twice.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly repository: IdempotencyRepository,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (this.reflector.get<boolean | undefined>(IDEMPOTENT, ctx.getHandler()) !== true) {
      return next.handle();
    }

    const req = getRequest(ctx);
    const res = ctx.switchToHttp().getResponse<Response>();
    if (req.auth === undefined) {
      throw Errors.unauthenticated();
    }
    const key = req.get('idempotency-key');
    if (key === undefined || !KEY_FORMAT.test(key)) {
      throw Errors.idempotencyKeyRequired();
    }

    const path = req.originalUrl.split('?')[0] ?? req.originalUrl;
    const requestHash = sha256Hex(JSON.stringify([req.method, path, req.validated?.body ?? null]));
    const claim = await this.repository.claim({
      hospitalId: req.auth.hospitalId,
      userId: req.auth.userId,
      key,
      method: req.method,
      path,
      requestHash,
      expiresAt: new Date(Date.now() + RETENTION_MS),
    });

    if (!claim.claimed) {
      const { record } = claim;
      if (record.requestHash !== requestHash) {
        throw Errors.idempotencyKeyReused();
      }
      if (record.status !== 'completed') {
        throw Errors.idempotencyInProgress();
      }
      res.setHeader('Idempotent-Replayed', 'true');
      return of(record.responseBody);
    }

    const status = this.reflector.get<number | undefined>(HTTP_CODE_METADATA, ctx.getHandler()) ?? (req.method === 'POST' ? 201 : 200);
    return next.handle().pipe(
      catchError((error: unknown) => from(this.repository.release(claim.id)).pipe(concatMap(() => throwError(() => error)))),
      concatMap(async (body: unknown) => {
        await this.repository.complete(claim.id, status, body);
        return body;
      }),
    );
  }
}
