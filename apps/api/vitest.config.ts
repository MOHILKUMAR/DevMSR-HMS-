import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// API tests read TEST_DATABASE_URL from the repo root .env locally. CI sets it directly.
const rootEnvFile = new URL('../../.env', import.meta.url);
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  // Tests run against the shared packages' source, so no build is needed first.
  resolve: { conditions: ['@devmsr/source'] },
  ssr: { resolve: { conditions: ['@devmsr/source'] } },
  test: {
    environment: 'node',
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'api',
          include: ['test/**/*.spec.ts'],
          // Wipes and migrates the test database once per run.
          globalSetup: ['test/support/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
