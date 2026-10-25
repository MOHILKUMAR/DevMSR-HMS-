import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const isDev = process.env.NODE_ENV === 'development';
// The browser calls the API directly, so the CSP must allow its origin.
const apiOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').origin;

// CLAUDE.md section 9: the same headers as the API. Scripts need 'unsafe-inline' because Next.js
// inlines its bootstrap scripts; a nonce-based policy would need proxy.ts to generate nonces (see
// docs/decisions.md). Everything else is locked to this origin and the API.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
