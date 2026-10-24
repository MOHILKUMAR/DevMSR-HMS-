import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './common/config/env.js';

// Local development reads the repo root .env. Containers get real environment variables instead.
const rootEnvFile = new URL('../../../.env', import.meta.url);
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const env = loadEnv(process.env);
const app = await NestFactory.create(AppModule);
configureApp(app, env);
app.enableShutdownHooks();
await app.listen(env.PORT);
