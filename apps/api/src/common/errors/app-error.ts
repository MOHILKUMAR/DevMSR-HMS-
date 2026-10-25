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
  loginChallengeInvalid: () =>
    new AppError(401, 'LOGIN_CHALLENGE_INVALID', 'Your sign-in timed out or was already finished. Sign in again.'),
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
  selfChangeNotAllowed: () =>
    new AppError(422, 'SELF_CHANGE_NOT_ALLOWED', 'You cannot change your own roles, status or password here. Ask another admin.'),
  roleNotAssignable: () =>
    new AppError(422, 'ROLE_NOT_ASSIGNABLE', 'One of the chosen roles does not exist in this hospital.'),
  doctorLoginInvalid: () =>
    new AppError(422, 'DOCTOR_LOGIN_INVALID', 'The login must be an active staff user with the doctor role who is not linked to another doctor.'),
  referenceInvalid: (what: string) => new AppError(422, 'REFERENCE_INVALID', `The chosen ${what} was not found or is inactive.`),
  rateDateInvalid: (message: string) => new AppError(422, 'RATE_DATE_INVALID', message),
  bedOccupied: () => new AppError(422, 'BED_OCCUPIED', 'A patient is in this bed or ward. Move or discharge the patient first.'),
  rateNotCancellable: (message: string) => new AppError(422, 'RATE_NOT_CANCELLABLE', message),
  // Details carry only patient IDs and UHIDs: never names, phone numbers or Aadhaar in an error.
  duplicatePatient: (matches: readonly { id: string; uhid: string }[]) =>
    new AppError(409, 'DUPLICATE_PATIENT', 'This Aadhaar or ABHA number belongs to a registered patient. Open that patient instead.', {
      matches,
    }),
  possibleDuplicate: (matches: readonly { id: string; uhid: string }[]) =>
    new AppError(409, 'POSSIBLE_DUPLICATE', 'This may be a patient who is already registered. Check the matches before registering.', {
      matches,
    }),
  rateMissing: () =>
    new AppError(422, 'RATE_MISSING', 'This service has no rate on the service date. Ask finance to set one in Rates and fees.'),
  chargeUnavailable: () =>
    new AppError(422, 'CHARGE_UNAVAILABLE', 'A chosen charge is already on a bill, or belongs to another patient. Reload and choose again.'),
  invoiceLocked: () => new AppError(409, 'INVOICE_LOCKED', 'This bill is no longer a draft. Issued bills never change.'),
  shiftRequired: () => new AppError(422, 'SHIFT_REQUIRED', 'Open your cash shift before taking money.'),
  shiftAlreadyOpen: () => new AppError(409, 'SHIFT_ALREADY_OPEN', 'Your shift is already open. Close it before opening another.'),
  amountExceedsDue: () => new AppError(422, 'AMOUNT_EXCEEDS_DUE', 'The amount is more than is due on this bill.'),
  noDepositHeld: () => new AppError(422, 'NO_DEPOSIT_HELD', 'This patient does not have that much deposit left to set against the bill.'),
  billNotIssued: () => new AppError(422, 'BILL_NOT_ISSUED', 'Issue the bill before taking payment against it.'),
  shiftClosed: () => new AppError(409, 'SHIFT_CLOSED', 'This shift is already closed.'),
  passwordReused: () =>
    new AppError(422, 'PASSWORD_REUSED', 'Choose a password different from the one you have now.'),
  currentPasswordWrong: () =>
    new AppError(422, 'CURRENT_PASSWORD_WRONG', 'Your current password is not right. Type it again.'),
  currentSession: () =>
    new AppError(422, 'CURRENT_SESSION', 'This is the session you are using now. Use Sign out to end it.'),
  totpInvalid: () =>
    new AppError(422, 'TOTP_INVALID', 'The code is not right. Check the time on your phone and type the newest code.'),
  twoFactorRequired: () =>
    new AppError(422, 'TWO_FACTOR_REQUIRED', 'Your role needs two-factor sign-in, so it cannot be turned off.'),
  twoFactorState: (message: string) => new AppError(409, 'TWO_FACTOR_STATE', message),
  breakGlassActive: () =>
    new AppError(409, 'BREAK_GLASS_ACTIVE', 'Break-glass access is already open in this session. End it before opening another.'),
  internal: () =>
    new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Try again, and tell your admin if it keeps happening.'),
};
