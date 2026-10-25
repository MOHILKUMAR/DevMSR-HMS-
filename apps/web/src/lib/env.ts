// NEXT_PUBLIC_ values are inlined into the browser bundle at build time, so they are read by their
// literal names. Never put a secret in one.
const publicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * The generated client's paths already start with /api/v1, so clients take the API's origin.
 * Throws at startup if the URL is not valid.
 */
export function apiOrigin(apiUrl: string): string {
  return new URL(apiUrl).origin;
}

/** What the browser calls. */
export const browserApiOrigin = apiOrigin(publicApiUrl);

/** What Server Components call: the API container's internal address in Docker. */
export function serverApiOrigin(): string {
  return apiOrigin(process.env.API_INTERNAL_URL ?? publicApiUrl);
}
