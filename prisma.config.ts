import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Local development reads the repo root .env. CI and containers set real environment variables,
// which take precedence over the file.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Migrations use the direct connection. The API uses the pooled DATABASE_URL.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
