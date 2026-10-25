/** Every error code the API returns. The web app maps each one to a message for staff. */
export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'SESSION_EXPIRED',
  'LOGIN_FAILED',
  'CSRF_FAILED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'IDEMPOTENCY_IN_PROGRESS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  // Business rules (422)
  'SELF_CHANGE_NOT_ALLOWED',
  'ROLE_NOT_ASSIGNABLE',
  'DOCTOR_LOGIN_INVALID',
  'REFERENCE_INVALID',
  'RATE_DATE_INVALID',
  'BED_OCCUPIED',
  'RATE_NOT_CANCELLABLE',
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
  'REQUEST_PENDING',
  'REQUEST_DECIDED',
  'SELF_APPROVAL_NOT_ALLOWED',
  'ABOVE_APPROVAL_LIMIT',
  'AMOUNT_TOO_LARGE',
  'RECEIPT_NOT_VOIDABLE',
  'REFUND_NOT_READY',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every API error response. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** Body of every API list response. */
export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}
