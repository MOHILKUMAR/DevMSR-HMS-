import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The test database, reached as a login user of the restricted hms_api role, like the API in production. */
    apiDatabaseUrl: string;
  }
}

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/** Vitest can fail while printing a global setup error's stack, so the message is written out first. */
function fail(message: string): never {
  process.stderr.write(`\nAPI tests cannot start: ${message}\n\n`);
  throw new Error(message);
}

/**
 * Resets the test database to the current migrations once per run, then creates the login user the
 * API connects as. TEST_DATABASE_URL is the owner, used for migrations and for trigger tests.
 */
export default function setup(project: TestProject): void {
  const url = process.env['TEST_DATABASE_URL'];
  if (url === undefined || url === '') {
    fail('TEST_DATABASE_URL is not set. Start PostgreSQL with `docker compose up -d` and copy .env.example to .env.');
  }
  // The reset drops every table, so refuse anything that is not clearly a test database.
  const databaseName = new URL(url).pathname.replace(/^\//, '');
  if (!databaseName.endsWith('_test')) {
    fail(`TEST_DATABASE_URL must name a database ending in _test (got "${databaseName}"). Tests wipe it.`);
  }
  const prisma = (args: string, input?: string) =>
    execSync(`pnpm exec prisma ${args}`, {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
      stdio: 'pipe',
      ...(input === undefined ? {} : { input }),
    });
  // Roles belong to the whole server, so each test database gets its own login user and parallel
  // runs against other test databases never change each other's password.
  const apiUser = `${databaseName}_api`;
  const apiPassword = randomBytes(24).toString('hex');
  try {
    prisma('migrate reset --force');
    // Indian servers often run in IST. With IST as the database default, any connection that skips
    // the app's UTC session setting stores shifted timestamps and fails timestamps.api.spec.ts.
    prisma('db execute --stdin', IST_DATABASE_DEFAULT);
    prisma('db execute --stdin', apiLoginUser(apiUser, apiPassword));
  } catch (error) {
    const output = error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error);
    fail(`could not reset the test database. Is PostgreSQL running?\n${output}`);
  }
  const apiUrl = new URL(url);
  apiUrl.username = apiUser;
  apiUrl.password = apiPassword;
  project.provide('apiDatabaseUrl', apiUrl.toString());
}

const IST_DATABASE_DEFAULT = `DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
END
$$;`;

/** The user name is built from the database name and the password is hex, so neither needs escaping. */
function apiLoginUser(user: string, password: string): string {
  return `DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = '${user}') THEN
    ALTER ROLE "${user}" LOGIN PASSWORD '${password}';
  ELSE
    CREATE ROLE "${user}" LOGIN PASSWORD '${password}';
  END IF;
END
$$;
GRANT hms_api TO "${user}";`;
}
