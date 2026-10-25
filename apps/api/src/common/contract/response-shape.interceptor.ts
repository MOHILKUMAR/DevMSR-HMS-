import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { map, type Observable } from 'rxjs';
import { Errors } from '../errors/app-error.js';
import { API_CONTRACT, type ApiContractOptions } from './api-contract.js';

/**
 * Parses every response through the contract's response schema. Unknown fields are stripped, so a
 * password hash or another internal field can never leak by accident. A mismatch is a server bug (500).
 */
@Injectable()
export class ResponseShapeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @InjectPinoLogger(ResponseShapeInterceptor.name) private readonly logger: PinoLogger,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const contract = this.reflector.get<ApiContractOptions | undefined>(API_CONTRACT, ctx.getHandler());
    const schema = contract?.response;
    return next.handle().pipe(
      map((data: unknown) => {
        if (schema === undefined) {
          return data;
        }
        const result = schema.safeParse(data);
        if (!result.success) {
          // Log paths only: values could be patient data.
          this.logger.error(
            { route: `${ctx.getClass().name}.${ctx.getHandler().name}`, paths: result.error.issues.map((i) => i.path.join('.')) },
            'Response does not match its contract',
          );
          throw Errors.internal();
        }
        return result.data;
      }),
    );
  }
}
