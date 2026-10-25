# Decisions

Every non-obvious decision, oldest first. Each entry has the date, the decision and the reason.

## 2026-10-25: The master prompt lives in `CLAUDE.md`

- Decision: the master prompt is stored as `CLAUDE.md` at the repo root.
- Reason: Claude Code loads `CLAUDE.md` at the start of every session, which is what the prompt asks for.

## 2026-10-25: One bootstrap commit went straight to `main`

- Decision: the developer approved a single commit to `main` with `CLAUDE.md`, `README.md`, `.gitignore` and `.gitattributes`. Everything after it goes through pull requests.
- Reason: the GitHub repository was empty, so a pull request had no base branch.

## 2026-10-25: pnpm 12, installed with npm

- Decision: pnpm 12.15.0, pinned through `packageManager`. Developers install it with `npm install -g pnpm@12.15.0`, not Corepack. CI uses `pnpm/action-setup`.
- Reason: pnpm 12 ships a native binary, and the Corepack bundled with Node.js 22 (0.34) cannot run it.

## 2026-10-25: Node.js 22 LTS everywhere

- Decision: Node.js 22 locally, in CI (`.nvmrc`) and in the Docker images (`node:22-slim`). `engines` requires 22.18 or later.
- Reason: it matches the development machine, and Prisma 7 needs 22.18 or later. Revisit Node.js 24 before go-live.

## 2026-10-25: TypeScript 6.0, not 7

- Decision: TypeScript 6.0.3 through the pnpm catalog.
- Reason: typescript-eslint 8.72 supports TypeScript below 6.1 only. TypeScript 7.0 would break type-aware linting.

## 2026-10-25: ESLint 9, not 10

- Decision: ESLint 9.39 with flat config, shared from `packages/config/eslint`.
- Reason: eslint-config-next 16.4 and the Next.js template target ESLint 9.

## 2026-10-25: The API is an ES module

- Decision: `apps/api` uses `"type": "module"`, `module: nodenext`, and relative imports end in `.js`.
- Reason: NestJS 12 is published as ES modules only.

## 2026-10-25: Shared packages build to `dist`, checks read source

- Decision: `packages/types` and `packages/validation` build to `dist` for runtime. Their `exports` also have a `@devmsr/source` condition that points at `src`. TypeScript (`customConditions`) and Vitest (`resolve.conditions`) use that condition, so lint, typecheck and tests need no build first. `apps/api/tsconfig.build.json` clears the condition so `nest build` compiles against `dist`.
- Reason: Node.js and Next.js load plain JavaScript at runtime, while checks stay fast and always see current source.

## 2026-10-25: Vitest without SWC

- Decision: API tests run on Vitest 5 with its built-in transformer. `unplugin-swc` and `@swc/core` (approved in the plan) were not added.
- Reason: Vite's transformer already emits decorator metadata, which Nest dependency injection needs. The API test that injects `HealthService` into `HealthController` proves it.

## 2026-10-25: API versioning through Nest URI versioning

- Decision: global prefix `api` plus URI versioning with default version `1`, so every route is `/api/v1/...`.
- Reason: a controller can later opt into `/api/v2` for a breaking change while `/api/v1` keeps working.

## 2026-10-25: List page size

- Decision: `pageSize` defaults to 50 and is capped at 100.
- Reason: 50 comes from the master prompt's example. The cap stops one request from pulling a whole table over weak hospital internet.

## 2026-10-25: PostgreSQL 17 for local development

- Decision: `docker-compose.yml` runs `postgres:17-alpine`, bound to 127.0.0.1, with a separate `hms_test` database for API tests.
- Reason: 17 is the major version Supabase runs for new projects, so local behaviour matches production. Check the Supabase project's version when it is created and align if it differs.

## 2026-10-25: Supply chain settings in `pnpm-workspace.yaml`

- Decision: `minimumReleaseAge: 1440` (versions must be at least 1 day old), build scripts blocked unless listed in `allowBuilds`, exact versions for direct dependencies.
- Reason: hijacked npm releases are usually caught within hours, and install scripts are the usual attack path.

## 2026-10-25: multer override

- Decision: `overrides.multer: 2.5.0`.
- Reason: `@nestjs/platform-express` 12.2.0 pins multer 2.4.0, which has a high severity advisory (GHSA-q7qp-rjg7-q26m) and fails `pnpm audit`. Remove the override once Nest depends on 2.5.0 or later.

## 2026-10-25: Docker images

- Decision: `node:22-slim` (Debian) for both images. The API image is built with `pnpm deploy --prod`. The web image uses the Next.js standalone output. Files are owned by root and the process runs as the `node` user. Only the web image's `.next/cache` is writable.
- Reason: Debian images avoid musl problems with native modules (argon2 later) and pnpm's native binary. Read-only code means a compromised process cannot rewrite itself.

## 2026-10-25: Next.js does not generate `AGENTS.md`

- Decision: `agentRules: false` in `apps/web/next.config.ts`.
- Reason: `CLAUDE.md` is the agent guide. The `AGENTS.md` that `next dev` writes contains an em dash, which `check:text` rejects, and Next.js restores it if edited. Version-matched Next.js docs are still in `node_modules/next/dist/docs/`.
