import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
// CLAUDE.md section 9: the same headers as the API. The Content-Security-Policy is set per request
// by src/proxy.ts, because it carries a fresh nonce for every page.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace from the workspace root so the standalone build includes the shared packages.
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot,
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
  poweredByHeader: false,
  reactStrictMode: true,
  // CLAUDE.md is the agent guide. Next's generated AGENTS.md contains an em dash that check:text rejects.
  agentRules: false,
  headers() {
    return Promise.resolve([{ source: '/:path*', headers: securityHeaders }]);
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
