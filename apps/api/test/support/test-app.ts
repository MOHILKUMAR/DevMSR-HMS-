import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { ModuleMetadata } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { loadEnv, type Env } from '../../src/common/config/env.js';
import { createPrismaClient } from '../../src/common/prisma/create-prisma-client.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';

export interface TestApp {
  app: NestExpressApplication;
  http: Server;
  env: Env;
  /** The app's own connection, as a login user of the restricted hms_api role. */
  prisma: PrismaService;
  /** The table owner, for tests that prove a trigger holds even for a connection with every privilege. */
  owner: PrismaClient;
  close: () => Promise<void>;
}

/** Secrets are random per test run, so nothing in tests depends on a real key. */
const TEST_SECRETS = {
  SESSION_SECRET: randomBytes(32).toString('base64'),
  FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

/** The API connects as the restricted role, so a missing grant fails a test instead of production. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: inject('apiDatabaseUrl'), ...TEST_SECRETS, ...overrides });
}

export function ownerDatabaseUrl(): string {
  const databaseUrl = process.env['TEST_DATABASE_URL'];
  if (databaseUrl === undefined) {
    throw new Error('TEST_DATABASE_URL is not set');
  }
  return databaseUrl;
}

/** The real app and pipeline, against the test database. `imports` adds test-only modules. */
export async function createTestApp(
  options: { env?: Record<string, string>; imports?: ModuleMetadata['imports'] } = {},
): Promise<TestApp> {
  const env = testEnv(options.env);
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(env), ...(options.imports ?? [])],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, env);
  // Listening up front means supertest never starts or stops the server itself, which breaks
  // overlapping requests.
  await app.listen(0, '127.0.0.1');
  const owner = createPrismaClient(ownerDatabaseUrl());
  return {
    app,
    http: app.getHttpServer(),
    env,
    prisma: app.get(PrismaService),
    owner,
    close: async () => {
      await owner.$disconnect();
      await app.close();
    },
  };
}
