/** Error codes that have their own message for staff in messages/en.json (`errors.*`). */
const KNOWN_CODES = [
  'LOGIN_FAILED',
  'RATE_LIMITED',
  'CSRF_FAILED',
  'SESSION_EXPIRED',
  'VALIDATION_FAILED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'SELF_CHANGE_NOT_ALLOWED',
  'ROLE_NOT_ASSIGNABLE',
  'DOCTOR_LOGIN_INVALID',
  'REFERENCE_INVALID',
  'RATE_DATE_INVALID',
  'BED_OCCUPIED',
  'RATE_NOT_CANCELLABLE',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
  'DUPLICATE_PATIENT',
  'POSSIBLE_DUPLICATE',
  'RATE_MISSING',
  'CHARGE_UNAVAILABLE',
  'INVOICE_LOCKED',
  'SHIFT_REQUIRED',
  'SHIFT_ALREADY_OPEN',
  'AMOUNT_EXCEEDS_DUE',
  'NO_DEPOSIT_HELD',
  'BILL_NOT_ISSUED',
  'SHIFT_CLOSED',
  'LOGIN_CHALLENGE_INVALID',
  'PASSWORD_REUSED',
  'CURRENT_PASSWORD_WRONG',
  'CURRENT_SESSION',
  'TOTP_INVALID',
  'TWO_FACTOR_REQUIRED',
  'TWO_FACTOR_STATE',
  'BREAK_GLASS_ACTIVE',
  'REQUEST_PENDING',
  'REQUEST_DECIDED',
  'SELF_APPROVAL_NOT_ALLOWED',
  'ABOVE_APPROVAL_LIMIT',
  'AMOUNT_TOO_LARGE',
  'RECEIPT_NOT_VOIDABLE',
  'REFUND_NOT_READY',
  'VISIT_STATE',
  'TOKEN_EXISTS',
  'BED_TAKEN',
  'ALREADY_ADMITTED',
  'ADMISSION_STATE',
  'DISCHARGE_STEP',
  'NOT_TREATING_DOCTOR',
  'BALANCE_NOT_ZERO',
  'ROOM_CHARGES_MISSING',
  'NOTHING_TO_BILL',
  'NOTHING_DUE',
] as const;

export type ErrorMessageKey = (typeof KNOWN_CODES)[number] | 'network' | 'unknown';

/** An API error response (`{ "error": { code, message, details } }`), thrown so mutations fail. */
export class ApiRequestError extends Error {
  constructor(readonly body: unknown) {
    super('API request failed');
    this.name = 'ApiRequestError';
  }

  get code(): unknown {
    const body = this.body;
    if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
    const error = body.error;
    return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  }
}

/**
 * Picks the message to show for a failed API call. Staff never see raw error text: unknown codes get
 * the generic message, and a request that never reached the API gets the connection message.
 */
export function errorMessageKey(error: unknown): ErrorMessageKey {
  if (error instanceof TypeError) return 'network';
  if (error instanceof ApiRequestError) {
    const code = error.code;
    return KNOWN_CODES.find((candidate) => candidate === code) ?? 'unknown';
  }
  return 'unknown';
}

/**
 * Unwraps an openapi-fetch result: the data, or an ApiRequestError that a mutation or query can show.
 * A 204 response has no data, so its data is undefined.
 */
export function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error !== undefined) throw new ApiRequestError(result.error);
  return result.data as T;
}
