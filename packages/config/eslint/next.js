import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { baseConfig } from './base.js';

/**
 * Rules for the Next.js web app.
 * @param {string} tsconfigRootDir directory of the calling package
 */
export function nextConfig(tsconfigRootDir) {
  return defineConfig(nextVitals, baseConfig(tsconfigRootDir), {
    rules: {
      // The web app is the UI layer only: every read and write goes through the API.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@prisma/*', 'prisma', '**/generated/prisma/**'], message: 'apps/web must call the API, never the database.' },
            { group: ['@devmsr/api', '@devmsr/api/*'], message: 'apps/web must call the API over HTTP.' },
          ],
        },
      ],
    },
  });
}
