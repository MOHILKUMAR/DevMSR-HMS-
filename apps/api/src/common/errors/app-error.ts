import type { ApiErrorCode } from '@devmsr/types';

/** An error that becomes `{ "error": { code, message, details } }` with its HTTP status. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Shared errors. Messages say what happened and what to do next, in plain words for staff.
 * They never contain patient data or another hospital's data.
 */
export const Errors = {
  validation: (details: unknown) =>
    new AppError(400, 'VALIDATION_FAILED', 'Some fields are missing or not valid. Check them and try again.', details),
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'You are not signed in. Sign in and try again.'),
  sessionExpired: () => new AppError(401, 'SESSION_EXPIRED', 'Your session has ended. Sign in again to continue.'),
  loginFailed: () =>
    new AppError(
      401,
      'LOGIN_FAILED',
      'Wrong username or password. After 5 failed tries the account is locked for 15 minutes.',
    ),
  csrfFailed: () => new AppError(403, 'CSRF_FAILED', 'This request could not be verified. Reload the page and try again.'),
  permissionDenied: () =>
    new AppError(403, 'PERMISSION_DENIED', 'You do not have permission to do this. Ask your hospital admin if you need it.'),
  notFound: (what = 'record') => new AppError(404, 'NOT_FOUND', `The ${what} was not found.`),
  conflict: (message: string) => new AppError(409, 'CONFLICT', message),
  idempotencyKeyRequired: () =>
    new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'This request needs an Idempotency-Key header of 16 to 128 letters, digits, - or _.'),
  idempotencyKeyReused: () =>
    new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request.'),
  idempotencyInProgress: () =>
    new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'This request is still being processed. Wait a moment and check before retrying.'),
  rateLimited: () => new AppError(429, 'RATE_LIMITED', 'Too many requests. Wait a minute and try again.'),
  internal: () =>
    new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Try again, and tell your admin if it keeps happening.'),
};
