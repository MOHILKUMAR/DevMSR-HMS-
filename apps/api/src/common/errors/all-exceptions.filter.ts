import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError, Errors } from './app-error.js';

/**
 * Turns every error into `{ "error": { code, message, details } }`.
 * Never sends stack traces, SQL or internal messages to the client. 5xx errors are logged with the request ID.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const error = this.toAppError(exception);

    if (error.status >= 500) {
      this.logger.error({ err: exception }, 'Request failed');
    }

    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
  }

  private toAppError(exception: unknown): AppError {
    if (exception instanceof AppError) {
      return exception;
    }
    if (exception instanceof ThrottlerException) {
      return Errors.rateLimited();
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      return Errors.conflict('This record already exists.');
    }
    if (exception instanceof HttpException) {
      return this.fromHttpException(exception);
    }
    return Errors.internal();
  }

  /** Framework errors: unknown routes, malformed JSON, oversized bodies. */
  private fromHttpException(exception: HttpException): AppError {
    const status = exception.getStatus();
    if (status === 404) return Errors.notFound('page');
    if (status === 400) return Errors.validation([{ location: 'body', path: '', message: 'The request body is not valid JSON.' }]);
    if (status === 413) return new AppError(413, 'VALIDATION_FAILED', 'The request is too large.');
    if (status === 401) return Errors.unauthenticated();
    if (status === 403) return Errors.permissionDenied();
    return status >= 500 ? Errors.internal() : new AppError(status, 'VALIDATION_FAILED', 'The request could not be processed.');
  }
}
