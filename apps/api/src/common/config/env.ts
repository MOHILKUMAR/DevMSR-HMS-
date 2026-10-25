import { z } from 'zod';

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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
});

export type Env = z.infer<typeof envSchema>;

/** Injection token for the validated environment. */
export const ENV = Symbol('ENV');

/** Validates the environment once at startup. Fails fast and names the bad keys, never their values. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid environment variables: ${keys}`);
  }
  return result.data;
}
