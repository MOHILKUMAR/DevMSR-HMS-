# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=https://api.example.in/api/v1 .

FROM node:22-slim AS build
RUN npm install -g pnpm@12.15.0
WORKDIR /repo

# Manifests first, so the dependency layer is reused until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile --filter "@devmsr/web..."

COPY . .
# NEXT_PUBLIC_ values are inlined into the browser bundle at build time, so they are build arguments.
# Never pass a secret here.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_ENV=production
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter "@devmsr/web..." build

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# Files stay owned by root and the process runs as the unprivileged node user, so it cannot change its own code.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
# Only the Next.js cache directory is writable.
RUN mkdir -p apps/web/.next/cache && chown node:node apps/web/.next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/robots.txt').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
