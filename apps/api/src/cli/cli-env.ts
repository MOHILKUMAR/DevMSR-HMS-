import { existsSync } from 'node:fs';

/**
 * Command line tools read the repo root .env locally, like main.ts. Containers get real environment
 * variables instead. The path is the same depth from `src/cli` (tsx) and `dist/cli` (node).
 */
export function loadCliEnv(): void {
  const rootEnvFile = new URL('../../../../.env', import.meta.url);
  if (existsSync(rootEnvFile)) {
    process.loadEnvFile(rootEnvFile);
  }
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function print(message: string): void {
  process.stdout.write(`${message}\n`);
}
