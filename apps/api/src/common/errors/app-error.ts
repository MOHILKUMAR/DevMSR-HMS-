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
  requestPending: () =>
    new AppError(409, 'REQUEST_PENDING', 'A request of this kind is already waiting for approval here. Wait for it to be decided.'),
  requestDecided: () => new AppError(409, 'REQUEST_DECIDED', 'This request has already been decided. Reload to see the decision.'),
  selfApproval: () =>
    new AppError(422, 'SELF_APPROVAL_NOT_ALLOWED', 'You asked for this, so someone else must approve or reject it.'),
  aboveApprovalLimit: () =>
    new AppError(422, 'ABOVE_APPROVAL_LIMIT', "This discount is above the hospital's finance limit. Only the MD can approve it."),
  amountTooLarge: () =>
    new AppError(422, 'AMOUNT_TOO_LARGE', 'This is more than the bill, line, deposit or overpayment allows. Check the amounts.'),
  receiptNotVoidable: () =>
    new AppError(
      422,
      'RECEIPT_NOT_VOIDABLE',
      'This receipt cannot be voided: its shift is closed, it is void already, or its deposit has been used or refunded.',
    ),
  refundNotReady: () => new AppError(409, 'REFUND_NOT_READY', 'This refund is not approved, or it has been paid already.'),
  visitState: () => new AppError(409, 'VISIT_STATE', 'This visit has moved on. Reload to see where it is now.'),
  tokenExists: () => new AppError(409, 'TOKEN_EXISTS', 'This patient already has an open token for this doctor today.'),
  bedTaken: () => new AppError(409, 'BED_TAKEN', 'This bed is no longer free. Choose another bed.'),
  alreadyAdmitted: () => new AppError(409, 'ALREADY_ADMITTED', 'This patient is already admitted. Open the current admission.'),
  admissionState: () => new AppError(409, 'ADMISSION_STATE', 'This admission has moved on. Reload to see where it is now.'),
  internal: () =>
    new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Try again, and tell your admin if it keeps happening.'),
};
