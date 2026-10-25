/** Error codes that have their own message for staff in messages/en.json (`errors.*`). */
const KNOWN_CODES = ['LOGIN_FAILED', 'RATE_LIMITED', 'CSRF_FAILED', 'SESSION_EXPIRED'] as const;

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
