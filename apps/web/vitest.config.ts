import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    // Shared packages are read from source, so no build is needed first.
    conditions: ['@devmsr/source'],
  },
  ssr: { resolve: { conditions: ['@devmsr/source'] } },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
