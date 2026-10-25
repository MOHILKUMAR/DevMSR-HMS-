import { z } from 'zod';
import { productionProblems } from './production-guard.js';

/** Base64 that decodes to at least `bytes` bytes. Used for secrets and keys. */
const base64Key = (bytes: number, exact: boolean) =>
  z
    .string()
    .min(1)
    .refine((value) => {
      const length = Buffer.from(value, 'base64').length;
      return exact ? length === bytes : length >= bytes;
    }, `Must be base64 of ${exact ? 'exactly' : 'at least'} ${bytes} bytes`);

const positiveInt = z.coerce.number().int().positive();
/** `KEY=` in an env file means "not set". */
const optionalString = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    // Which deployment this is. Staging is a production build that keeps mock adapters (CLAUDE.md
    // section 7: live keys only in production). Required when NODE_ENV is production.
    APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
    PORT: positiveInt.default(4000),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'Must be a postgresql:// URL'),
    SESSION_SECRET: base64Key(32, false),
    FIELD_ENCRYPTION_KEY: base64Key(32, true),
    // Parent domain shared by the app. and api. hosts, for example .devmsr.in. Empty on localhost.
    COOKIE_DOMAIN: z.string().optional(),
    // Express "trust proxy": which proxies (Caddy, Cloudflare) may set X-Forwarded-For.
    TRUST_PROXY: z.string().default('loopback'),
    // Starting values from CLAUDE.md section 9, kept in config so they can change without code.
    RATE_LIMIT_LOGIN_PER_MINUTE: positiveInt.default(5),
    RATE_LIMIT_API_PER_MINUTE: positiveInt.default(300),
    SENTRY_DSN: optionalString.pipe(z.url().optional()),
    // Vendor adapters (CLAUDE.md section 14). Each real adapter adds its name here when it is built.
    PAYMENTS_PROVIDER: z.enum(['mock']).default('mock'),
    WHATSAPP_PROVIDER: z.enum(['mock']).default('mock'),
    SMS_PROVIDER: z.enum(['mock']).default('mock'),
    EMAIL_PROVIDER: z.enum(['mock']).default('mock'),
    ABDM_MODE: z.enum(['off', 'mock']).default('off'),
    // Background jobs (pg-boss), such as the midnight room and nursing charges. Off in API tests,
    // which run the job's work directly.
    JOBS_ENABLED: z.stringbool().default(true),
    // pg-boss creates and changes its own tables, so in production it connects as a login that owns
    // only its schema, never the API's restricted role. Defaults to DATABASE_URL in development.
    JOBS_DATABASE_URL: optionalString.pipe(z.string().regex(/^postgres(ql)?:\/\//, 'Must be a postgresql:// URL').optional()),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.APP_ENV === undefined) {
      ctx.addIssue({ code: 'custom', path: ['APP_ENV'], message: 'Required when NODE_ENV is production' });
    }
    if (env.APP_ENV === 'production' && env.NODE_ENV !== 'production') {
      ctx.addIssue({ code: 'custom', path: ['NODE_ENV'], message: 'Must be production when APP_ENV is production' });
    }
  })
  .transform((env) => ({ ...env, APP_ENV: env.APP_ENV ?? 'development' }));

export type Env = z.infer<typeof envSchema>;

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

/**
 * Validates the environment once at startup. Fails fast and names the bad keys, never their values.
 * In production it also refuses mock adapters, a missing Sentry DSN and demo or placeholder secrets.
 */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid environment variables: ${keys}`);
  }
  if (result.data.APP_ENV === 'production') {
    const problems = productionProblems(result.data, source);
    if (problems.length > 0) {
      throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
    }
  }
  return result.data;
}
