import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** Vitest can fail while printing a global setup error's stack, so the message is written out first. */
function fail(message: string): never {
  process.stderr.write(`\nAPI tests cannot start: ${message}\n\n`);
  throw new Error(message);
}

/** Resets the test database to the current migrations once per test run. */
export default function setup(): void {
  const url = process.env['TEST_DATABASE_URL'];
  if (url === undefined || url === '') {
    fail('TEST_DATABASE_URL is not set. Start PostgreSQL with `docker compose up -d` and copy .env.example to .env.');
  }
  // The reset drops every table, so refuse anything that is not clearly a test database.
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    fail(`TEST_DATABASE_URL must name a database ending in _test (got "${databaseName}"). Tests wipe it.`);
  }
  try {
    execSync('pnpm exec prisma migrate reset --force', {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
    fail(`could not reset the test database. Is PostgreSQL running?\n${output}`);
  }
}
