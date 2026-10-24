import { randomBytes } from 'node:crypto';
import { DiscoveryService, MetadataScanner, NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadEnv } from '../common/config/env.js';
import { listRoutes } from '../common/routes/route-catalog.js';
import { buildOpenApi, type OpenApiDocument } from './build-openapi.js';

/**
 * Boots the app without listening and builds the OpenAPI document from its routes. The settings are
 * throwaway: nothing here connects to a database or uses a real secret.
 */
export async function generateOpenApiDocument(): Promise<OpenApiDocument> {
  const env = loadEnv({
    NODE_ENV: 'development',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://openapi@127.0.0.1:1/unused',
    SESSION_SECRET: randomBytes(32).toString('base64'),
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  });
  const app = await NestFactory.create(AppModule.forRoot(env), { logger: false });
  try {
    await app.init();
    return buildOpenApi(listRoutes(app.get(DiscoveryService), app.get(MetadataScanner)));
  } finally {
    await app.close();
  }
}

export function serializeOpenApi(document: OpenApiDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
