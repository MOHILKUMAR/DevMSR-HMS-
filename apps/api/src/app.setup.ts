import { VersioningType, type INestApplication } from '@nestjs/common';
import type { Env } from './common/config/env.js';

/** Global HTTP setup, shared by main.ts and the API tests so tests exercise the real pipeline. */
export function configureApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix('api');
  // Every route is /api/v1 unless a controller opts into a newer version.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
}
