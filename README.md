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

```bash
docker compose up -d
```

```bash
pnpm dev
```

The web app runs on http://localhost:3000 and the API on http://localhost:4000/api/v1 (try `/api/v1/health`).

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
| `pnpm test` | Unit and API tests |
| `pnpm check:text` | Fails if any tracked file contains an em dash or en dash |

`pnpm db:migrate`, `pnpm db:seed`, `pnpm test:e2e` and `pnpm api:spec` arrive with the request pipeline and web shell.

## Docker images

Build from the repo root:

```bash
docker build -f apps/api/Dockerfile -t devmsr-hms-api .
```

```bash
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 -t devmsr-hms-web .
```
