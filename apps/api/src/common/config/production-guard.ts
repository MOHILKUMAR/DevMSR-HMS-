import type { Env } from './env.js';

/** Database passwords used by the local Docker database and CI. Never valid in production. */
const DEMO_DATABASE_PASSWORD = /local_only|ci_only/i;
/** A real 32-byte random key has about 28 distinct byte values; a typed placeholder has a handful. */
const MIN_DISTINCT_KEY_BYTES = 16;

function looksLikePlaceholder(base64: string): boolean {
  return new Set(Buffer.from(base64, 'base64')).size < MIN_DISTINCT_KEY_BYTES;
}

/** Takes a string because each adapter setting gains real adapter names over time. */
function isMock(value: string): boolean {
  return value === 'mock';
}

function databasePassword(url: string | undefined): string {
  if (url === undefined || url === '') return '';
  try {
    return decodeURIComponent(new URL(url).password);
  } catch {
    return '';
  }
}

/**
 * Settings that are fine on a laptop or staging but must never reach production (CLAUDE.md sections
 * 7, 9 and 14). Messages name the setting, never its value. `source` is the raw environment, for
 * settings the API does not otherwise read.
 */
export function productionProblems(env: Env, source: Record<string, string | undefined>): string[] {
  const problems: string[] = [];

  for (const key of ['PAYMENTS_PROVIDER', 'WHATSAPP_PROVIDER', 'SMS_PROVIDER', 'EMAIL_PROVIDER'] as const) {
    if (isMock(env[key])) problems.push(`${key} uses the mock adapter`);
  }
  if (isMock(env.ABDM_MODE)) problems.push('ABDM_MODE uses the mock adapter');
  if (env.SENTRY_DSN === undefined) problems.push('SENTRY_DSN is not set');

  if (env.SESSION_SECRET === env.FIELD_ENCRYPTION_KEY) problems.push('SESSION_SECRET and FIELD_ENCRYPTION_KEY are the same value');
  if (looksLikePlaceholder(env.SESSION_SECRET)) problems.push('SESSION_SECRET looks like a placeholder, not random bytes');
  if (looksLikePlaceholder(env.FIELD_ENCRYPTION_KEY)) problems.push('FIELD_ENCRYPTION_KEY looks like a placeholder, not random bytes');
  for (const key of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    if (DEMO_DATABASE_PASSWORD.test(databasePassword(source[key]))) problems.push(`${key} uses the local or CI demo password`);
  }
  if ((source['SEED_USER_PASSWORD'] ?? '') !== '') problems.push('SEED_USER_PASSWORD is set: demo users must never exist in production');

  const insecure = env.CORS_ORIGINS.filter((origin) => !origin.startsWith('https://'));
  if (insecure.length > 0) problems.push('CORS_ORIGINS must list https:// origins only');

  return problems;
}
