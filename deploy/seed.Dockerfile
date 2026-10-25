# syntax=docker/dockerfile:1
# One-off image that loads the fake demo hospital (prisma/seed.ts) on staging only. The seed reuses
# the API's own code for password hashes, field encryption and the role sync, so it needs the API's
# source and dependencies, which the production API image does not carry.
# Build from the repo root: docker build -f deploy/seed.Dockerfile .
# Run through deploy/seed-staging.sh, never by hand: the script checks this is staging.

FROM node:22-slim
RUN npm install -g pnpm@12.15.0
WORKDIR /repo

# Manifests first, so the dependency layer is reused until a package.json or the lockfile changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/validation/package.json packages/validation/
# The root project carries Prisma and tsx; the API and its workspace packages carry the rest.
RUN pnpm install --frozen-lockfile --filter "@devmsr/api..." --filter devmsr-hms

COPY tsconfig.json prisma.config.ts ./
COPY prisma prisma/
COPY packages packages/
COPY apps/api apps/api/
# The Prisma client is generated, and the shared packages built (they resolve to dist), at build
# time: the running container writes nothing to /repo.
RUN pnpm db:generate && pnpm --filter "@devmsr/api^..." build

# Files stay owned by root and the process runs as the unprivileged node user.
USER node
CMD ["pnpm", "exec", "prisma", "db", "seed"]
