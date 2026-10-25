# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/api/Dockerfile .

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
RUN pnpm install --frozen-lockfile --filter "@devmsr/api..."

COPY . .
# deploy copies the API's dist and production dependencies, with the shared packages' dist, into /out.
RUN pnpm --filter "@devmsr/api..." build \
  && pnpm --filter @devmsr/api deploy --prod /out

FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
# Files stay owned by root and the process runs as the unprivileged node user, so it cannot change its own code.
COPY --from=build /out ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/v1/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "dist/main.js"]
