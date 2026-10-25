import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace from the workspace root so the standalone build includes the shared packages.
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  // CLAUDE.md is the agent guide. Next's generated AGENTS.md contains an em dash that check:text rejects.
  agentRules: false,
};

export default nextConfig;
