import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Locally the seeded demo password comes from the repo root .env. CI sets it directly.
const rootEnvFile = new URL('../../.env', import.meta.url);
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const ci = process.env['CI'] !== undefined;

/**
 * End-to-end tests against the real web app, API and a seeded database (`pnpm db:seed`).
 * Locally they reuse servers already running from `pnpm dev`. In CI they start the production builds.
 */
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  retries: ci ? 1 : 0,
  forbidOnly: ci,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // CI installs Playwright's Chromium. Locally, PLAYWRIGHT_CHANNEL=chrome or msedge uses the
      // browser already on the machine instead of downloading one.
      use: { ...devices['Desktop Chrome'], channel: process.env['PLAYWRIGHT_CHANNEL'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @devmsr/api start',
      url: 'http://localhost:4000/api/v1/health',
      cwd: '../..',
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      // CI runs the standalone server, as the Docker image does. CI copies static files into it first.
      command: ci ? 'node .next/standalone/apps/web/server.js' : 'pnpm start',
      // The standalone server binds to HOSTNAME, which CI runners set to the machine name.
      env: { HOSTNAME: '0.0.0.0', PORT: '3000' },
      url: 'http://localhost:3000/login',
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
  ],
});
