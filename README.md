# DevMSR HMS

Hospital management system for a pilot hospital in India: registration, OPD, IPD, billing, payments and discharge, built as a light web app that works on weak hospital internet.

`CLAUDE.md` is the master prompt and the single source of truth for how this project is built: stack, architecture, rules, security controls and design system. Decisions made along the way are in `docs/decisions.md`.

## Prerequisites

- Node.js 22.18 or later
- pnpm 12: `npm install -g pnpm@12.15.0`
- Docker Desktop (on Windows it needs WSL 2), for the local PostgreSQL

## First run

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

Fill in `SESSION_SECRET` and `FIELD_ENCRYPTION_KEY` in `.env` (the file says how to generate them).

```bash
docker compose up -d
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Open http://localhost:3000 and sign in. The seed creates a fake demo hospital with one user per role (`superadmin`, `admin`, `md`, `accounts`, `billing`, `cashier`, `reception`, `doctor`, `nurse`, `pharmacy`, `lab`, `ot`), all with `SEED_USER_PASSWORD` from `.env`. Each role sees only its own sections in the sidebar. The API is on http://localhost:4000/api/v1 (try `/api/v1/health`).

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js UI. Never talks to the database. |
| `apps/api` | NestJS API: controllers, services, repositories. |
| `packages/validation` | Zod schemas shared by web and api. |
| `packages/types` | Shared TypeScript types. |
| `packages/config` | Shared ESLint and tsconfig. |
| `docs/` | Billing rules, decisions, API list, feature checklist, Bruno collection. |

## Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds the shared packages, then runs them, the API and the web app in watch mode |
| `pnpm build` | Production builds of every package |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Unit tests, and API tests against `TEST_DATABASE_URL` (wiped on every run) |
| `pnpm check:text` | Fails if any tracked file contains an em dash or en dash |
| `pnpm db:migrate` | Creates and applies a migration in development |
| `pnpm db:seed` | Loads the fake demo hospital |
| `pnpm db:reset` | Drops the development database and reapplies every migration |
| `pnpm db:deploy` | Applies pending migrations (staging and production) |
| `pnpm api:spec` | Regenerates `docs/openapi.json` and the web app's API types |
| `pnpm test:e2e` | Playwright tests against the seeded demo hospital, reusing a running `pnpm dev` |

Playwright normally downloads its own Chromium (`pnpm --filter @devmsr/web exec playwright install chromium`). To use the browser already on your machine instead, set the channel:

```bash
PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e
```

## Docker images

Build from the repo root:

```bash
docker build -f apps/api/Dockerfile -t devmsr-hms-api .
```

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 -t devmsr-hms-web .
```
