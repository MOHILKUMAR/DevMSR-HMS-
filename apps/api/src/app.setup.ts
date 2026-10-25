import { VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Env } from './common/config/env.js';
import { API_PREFIX, DEFAULT_API_VERSION } from './common/routes/route-catalog.js';

/** Express "trust proxy" accepts a hop count, true/false, or names such as "loopback". */
function trustProxy(value: string): number | boolean | string {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true' || value === 'false') return value === 'true';
  return value;
}

/**
 * Pipeline step 2 (middleware) and global HTTP setup. Shared by main.ts and the API tests, so tests
 * run the real pipeline. Request ID and pino logging come from LoggerModule.
 */
export function configureApp(app: NestExpressApplication, env: Env): void {
  app.useLogger(app.get(Logger));
  // Client IPs (rate limits, login records) come from X-Forwarded-For only when set by a trusted proxy.
  app.set('trust proxy', trustProxy(env.TRUST_PROXY));
  app.use(
    helmet({
      // The API returns JSON only, so nothing may load or frame it.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
      },
      xFrameOptions: { action: 'deny' },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  // Every route is /api/v1 unless a controller opts into a newer version.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: DEFAULT_API_VERSION });
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'Idempotent-Replayed'],
    maxAge: 600,
  });
}
