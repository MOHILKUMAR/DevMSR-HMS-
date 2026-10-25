# syntax=docker/dockerfile:1
# One-off image that applies Prisma migrations (`pnpm db:deploy`) before a release starts.
# The API image is built with `pnpm deploy --prod` and has no Prisma CLI, so migrations get their own
# image. Build from the repo root: docker build -f deploy/migrate.Dockerfile .
# Needs DIRECT_URL (a session or direct connection, never a transaction pooler).

FROM node:22-slim
RUN npm install -g pnpm@12.15.0
WORKDIR /repo

# The workspace manifests are needed for a frozen install, even though only the root project is installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
# The root project carries the Prisma CLI.
RUN pnpm install --frozen-lockfile --filter devmsr-hms

COPY prisma.config.ts ./
COPY prisma/schema.prisma prisma/
COPY prisma/migrations prisma/migrations/

# Files stay owned by root and the process runs as the unprivileged node user.
USER node
ENV NODE_ENV=production
CMD ["pnpm", "db:deploy"]
