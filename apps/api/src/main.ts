import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './common/config/env.js';

// Local development reads the repo root .env. Containers get real environment variables instead.
const rootEnvFile = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const env = loadEnv(process.env);
const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), { bufferLogs: true });
configureApp(app, env);
app.enableShutdownHooks();
await app.listen(env.PORT);
