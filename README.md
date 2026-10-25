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

Create the API's own database login (the user in `DATABASE_URL`). It belongs to the restricted `hms_api` role, which cannot change the schema or audit rows; migrations keep using the owner in `DIRECT_URL`.

```bash
pnpm db:api-user
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Open http://localhost:3000 and sign in. The seed creates a fake demo hospital with one user per role (`superadmin`, `admin`, `md`, `accounts`, `billing`, `cashier`, `reception`, `doctor`, `nurse`, `pharmacy`, `lab`, `ot`), all with `SEED_USER_PASSWORD` from `.env`. Each role sees only its own sections in the sidebar. The API is on http://localhost:4000/api/v1 (try `/api/v1/health`).

Start with **Settings**. As `admin`, add staff users and their roles, departments, doctors (linked to their logins), room categories, wards and beds, and the hospital details printed on bills. As `accounts`, add service items and set their rates from a date. The demo rates are fake.

At the front desk, sign in as `reception`: search patients from the top bar (press `/`) by UHID, mobile or name, and register new ones under **Patients**. Each new patient gets the next UHID, such as `DEMO-2026-000051`.

To bill, sign in as `billing`: under **Billing**, find the patient, add charges, prepare a bill and issue it (it gets a number such as `DEMO/INV/2026-27/000001` and is locked). Then sign in as `cashier`: under **Payments**, open your shift with the cash in the drawer, find the patient, take a deposit or a payment, print the receipt on A4 or an 80 mm slip, and close the shift with a cash count. `accounts` sees every cashier's shifts.

Discounts, credit notes, refunds and receipt voids need a second person. The billing clerk asks for a discount on a draft bill or a credit note on an issued one; the cashier asks for a refund or a receipt void. `accounts` approves discounts up to Rs 1,000, credit notes and voids under **Approvals**; `md` approves larger discounts and every refund. The cashier then pays the refund out from their shift.

For OPD, `reception` issues a token under **OPD** (find the patient, choose the doctor, print the slip). The `cashier` takes the consultation fee from **OPD fees waiting** on the cash counter, and only then does the patient appear in `doctor`'s queue under **OPD**, where the doctor calls them in, writes notes, orders tests and completes the visit.

After pulling changes that add permissions, run `pnpm db:sync-roles --apply`: it brings every hospital's seeded roles in line with `apps/api/src/auth/permission-matrix.ts` and keeps your data (`pnpm db:seed` does the same for the demo hospital). The API logs a warning at start-up while they differ.

## Layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js UI. Never talks to the database. |
| `apps/api` | NestJS API: controllers, services, repositories. |
| `packages/validation` | Zod schemas shared by web and api. |
| `packages/types` | Shared TypeScript types. |
| `packages/config` | Shared ESLint and tsconfig. |
| `docs/` | Billing rules, decisions, API list, feature checklist, go-live checklist, Bruno collection. |

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
| `pnpm db:api-user` | Creates the API's database login from `DATABASE_URL`, or resets its password (once per environment) |
| `pnpm db:sync-roles` | Shows how seeded roles differ from the permission matrix; `--apply` fixes them in every hospital, with audit events (every deploy) |
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
