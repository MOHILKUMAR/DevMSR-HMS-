import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run against the shared packages' source, so no build is needed first.
  resolve: { conditions: ['@devmsr/source'] },
  ssr: { resolve: { conditions: ['@devmsr/source'] } },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
  },
});
