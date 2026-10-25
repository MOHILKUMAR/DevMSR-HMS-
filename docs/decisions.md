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

## 2026-10-25: Prisma 7.10 with the node-postgres adapter

- Decision: Prisma 7.10.1 (the `latest` npm tag points at an 8.0 release candidate). The client is generated into `apps/api/src/generated/prisma` (not committed) by `pnpm db:generate`, which the root `build`, `dev`, `lint`, `typecheck` and `test` scripts run first. The API connects through `@prisma/adapter-pg`.
- Reason: Prisma 7 needs a driver adapter, and generating into the API keeps Prisma out of every other package.

## 2026-10-25: UUIDv7 primary keys

- Decision: `@default(uuid(7))`, generated by Prisma.
- Reason: time-ordered UUIDs keep B-tree inserts local, unlike random v4. PostgreSQL 17 has no built-in v7 function.

## 2026-10-25: Platform users and roles have no hospital

- Decision: `users.kind` is `staff` or `platform`. A check constraint makes `hospital_id` null exactly for platform users. Roles with a null `hospital_id` are platform roles, kept unique by a partial index (Prisma's `partialIndexes` preview feature). Usernames are lowercase and unique across the platform.
- Reason: the super admin works across hospitals but must not reach hospital data without break-glass. A global username means login needs no hospital picker.
- Watch out: Prisma exposes the partial index as `where: { code }`. Never look a role up by code alone.

## 2026-10-25: Composite foreign keys for tenant safety

- Decision: `wards (hospital_id, branch_id)` references `branches (hospital_id, id)` and `beds (hospital_id, ward_id)` references `wards (hospital_id, id)`.
- Reason: the database itself stops a bed from pointing at another hospital's ward. Later child tables follow the same pattern.

## 2026-10-25: Rules enforced by triggers

- Decision: triggers reject UPDATE, DELETE and TRUNCATE on `audit_events` and `login_events`, and DELETE and TRUNCATE on `patients`, raising `insufficient_privilege` (42501). That code is used, rather than `restrict_violation` (which Prisma reports as a foreign key error), so the message reaches the logs.
- Reason: no code path can remove audit history or clinical records.
- Before go-live: the table owner can disable triggers. Run the API as a separate database role that does not own the tables and has no UPDATE, DELETE or TRUNCATE on `audit_events`.

## 2026-10-25: Sessions and cookies

- Decision: a random 256-bit token in the cookie, only its SHA-256 in `sessions`. `last_seen_at` is written at most once a minute, so the 15 minute idle limit is accurate to about a minute. Cookies have no Max-Age, so they end when the browser closes (shared counter computers). Production cookie names use the `__Secure-` prefix. `COOKIE_DOMAIN` shares the cookies between the `app.` and `api.` hosts so Next.js can see the session.
- Reason: section 9 session rules, without a database write on every request.

## 2026-10-25: CSRF tokens

- Decision: signed double-submit. The token is `nonce.HMAC(session ID, nonce)` with a key derived from `SESSION_SECRET`. It is required on every POST, PUT, PATCH and DELETE, login included. `GET /auth/csrf` issues the pre-login token.
- Reason: a plain double-submit token can be planted by a sibling subdomain. Binding it to the session stops that.

## 2026-10-25: Login failures look identical

- Decision: unknown username, wrong password, locked and inactive accounts all return one `LOGIN_FAILED` error, and every path runs one Argon2 verification (a dummy hash for unknown usernames). The fifth consecutive failure locks the account for 15 minutes and resets the counter. Argon2id cost is the OWASP baseline: 19 MiB, 2 passes, 1 lane.
- Reason: responses and timing do not reveal which usernames exist. The cost keeps a shift change with many logins within a small server's memory.

## 2026-10-25: Rate limit keys

- Decision: the general limit is counted across all routes per session cookie (per IP without one). The login limit is per IP and username. Storage is in memory.
- Reason: a hospital behind one NAT address must not share one budget. In-memory storage works for one API instance. Running several instances needs shared storage (PostgreSQL), since Redis is not allowed. Volumetric floods are left to Cloudflare.

## 2026-10-25: Validation runs as an interceptor

- Decision: each route declares `@ApiContract({ body, query, params, response })`. An interceptor validates input before the idempotency step, and handlers read it with `@ValidBody()`, `@ValidQuery()` and `@ValidParams()`. Every response is parsed through its response schema, so unknown fields are stripped.
- Reason: Nest runs pipes after interceptors, but section 4 puts validation before idempotency. Express 5 makes `req.query` read-only, so validated input lives on `req.validated`.

## 2026-10-25: Routes that break the rules stop startup

- Decision: at startup the API lists every route and refuses to start if one lacks `@ApiContract`, lacks both `@Public()` and `@RequirePermission()`, or uses `@Idempotent()` outside a signed-in POST.
- Reason: section 19 forbids routes without a permission, and failing at startup catches it before a test or a reviewer has to.

## 2026-10-25: Idempotency details

- Decision: keys are 16 to 128 characters, scoped to the user and kept 24 hours (a cleanup job comes with pg-boss). A replay returns the stored response with `Idempotent-Replayed: true`. The same key with a different body gets 422, and a key still in progress gets 409. A failed handler frees the key. If saving the response fails after the handler succeeded, the key stays in progress, so a retry can never run the change twice.
- Revisit: the response is saved in its own transaction. With the first real financial route, save it inside the business transaction.

## 2026-10-25: Every role holds `auth.session.manage-own`

- Decision: `/auth/me` and `/auth/logout` require `auth.session.manage-own`, which every seeded role has.
- Reason: section 4 allows only permission-coded or `@Public()` routes, and these need a signed-in user.
- Also: the cashier has `billing.refund.request` (section 12 has the cashier refund excess deposit after approval). TOTP is required for super admin, hospital admin and accountant (`ROLES_REQUIRING_TOTP`), but is enforced in the TOTP slice.

## 2026-10-25: Field encryption format

- Decision: AES-256-GCM with a random 12-byte IV, stored as `v1:iv:ciphertext:tag`, with the field name as additional data. A separate HMAC-SHA256 blind index (key derived from `FIELD_ENCRYPTION_KEY`) supports duplicate checks. Digits only are stored, and the last 4 are kept for masked display.
- Reason: the version prefix allows key rotation, and the field binding stops an Aadhaar ciphertext from being copied into the ABHA column.

## 2026-10-25: OpenAPI without zod-to-openapi

- Decision: `pnpm api:spec` builds OpenAPI 3.1 from the route catalog with Zod 4's own `z.toJSONSchema`, writes `docs/openapi.json`, and generates web types with `openapi-typescript` into `apps/web/src/lib/api/generated/`. A test fails when the committed file is stale. `@asteasolutions/zod-to-openapi` (approved) was not needed. `openapi-fetch` is added with the web shell, which first uses it. Swagger UI comes later.
- Reason: one fewer dependency, and the spec cannot drift from the code.

## 2026-10-25: Test database

- Decision: API tests use `TEST_DATABASE_URL`, whose database name must end in `_test`. Each run starts with `prisma migrate reset`. Test files create their own hospitals and users, so they run in parallel.
- Reason: tests can never wipe the development database by mistake.

## 2026-10-25: Fake seed data

- Decision: phone numbers start with `+910` and Aadhaar and ABHA numbers start with `0`, none of which are ever issued. The seed uses a fixed random seed and refuses to run in production. Demo users share `SEED_USER_PASSWORD` from `.env`.
- Reason: section 7 forbids real patient data, and random valid-looking numbers could belong to real people.

## 2026-10-25: Database sessions run in UTC

- Decision: every API and seed connection opens with `options: '-c TimeZone=UTC'` (`prismaAdapter()` in `apps/api/src/common/prisma/create-prisma-client.ts`). The test database defaults to `Asia/Kolkata`, and CI's PostgreSQL runs with `TZ=Asia/Kolkata`, so `timestamps.api.spec.ts` fails if a connection is not pinned.
- Reason: `@prisma/adapter-pg` sends dates as UTC clock time without an offset, and PostgreSQL reads them in the session time zone. A server set to IST (as a local install picks up from Windows) stored every timestamp 5.5 hours early. The app's reads hid it, but SQL `now()`, reports and retention would be wrong.
- Watch out: some connection poolers reject the `options` startup parameter. If the production `DATABASE_URL` goes through one, the API fails to connect at startup rather than storing wrong times. Then use a session-mode connection, or rely on the database default (`ALTER DATABASE ... SET timezone = 'UTC'`, which Supabase already uses).

## 2026-10-25: Build scripts allowed for Prisma only

- Decision: `allowBuilds` runs the install scripts of `prisma` and `@prisma/engines` (Node.js version check and the migration engine download). argon2, esbuild, `@parcel/watcher` and `@swc/core` stay blocked because they ship prebuilt binaries.
- Reason: install scripts are the usual supply chain attack path, so each one is allowed by name.

## 2026-10-25: The session redirect lives in `src/proxy.ts`

- Decision: the file `CLAUDE.md` calls `middleware.ts` is `apps/web/src/proxy.ts`. It does only what section 3 allows: redirect to `/login` (with `?next=<path>`) when no session cookie exists.
- Reason: Next.js 16 deprecated the `middleware` file convention and renamed it `proxy`.

## 2026-10-25: Content-Security-Policy without nonces

- Decision: `next.config.ts` sends the section 9 headers (CSP, HSTS, `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: no-referrer`, `Permissions-Policy`). The CSP allows `'unsafe-inline'` scripts, because Next.js inlines its bootstrap scripts. Everything else is restricted to this origin and the API.
- Reason: a nonce-based CSP needs the proxy to create a nonce per request, which is more than the redirect `CLAUDE.md` limits the proxy to.
- Revisit before go-live: tighten scripts with nonces (needs the developer's approval for the proxy change) or with Next.js's experimental SRI support.

## 2026-10-25: Tailwind 4 tokens live in `globals.css`

- Decision: design tokens are CSS variables in `apps/web/src/app/globals.css`, exposed to Tailwind with `@theme inline` (`bg-primary`, `text-text-muted`, `bg-success-soft`...). `packages/config` has no Tailwind preset. Dark mode is the `dark` class on `<html>`, set from the `hms_theme` cookie so the server renders it without a flash. Dark soft backgrounds are tinted surfaces, since section 16 lists light ones only.
- Reason: Tailwind 4 replaced JavaScript presets with CSS. With one web app, a shared CSS file would only add a hop. Move the `@theme` block to `packages/config` if a second app appears.

## 2026-10-25: Web app libraries

- Decision: next-intl without locale routing (English, IST time zone, type-checked message keys). TanStack Query for mutations. React Hook Form with a 20-line Zod resolver in `src/lib/forms.ts`, which keeps only failing field paths so screens show messages from `en.json`. shadcn/ui components are written in place (`button`, `input`, `label`). The typed client is `openapi-fetch` over the generated `schema.d.ts`.
- Reason: everything is from the agreed stack or the approved list. `@hookform/resolvers` would be one more dependency for a few lines.

## 2026-10-25: Sign-in flow on the web

- Decision: the login screen fetches a CSRF token on load, then posts with `X-CSRF-Token`. After sign-in it goes to `?next=`, which must be a path on this site (`safeRedirectPath`). The signed-in layout calls `GET /auth/me` from the server, forwarding only the session cookie. A missing or expired session redirects to `/login`. Sidebar items are hidden by permission code (`features/shell/nav-items.ts`). That is a convenience only: the API checks every request.
- Reason: keeps the proxy to its single redirect, puts the real check in the API, and stops `?next=` being used to send staff to another site after they type their password.

## 2026-10-25: Playwright

- Decision: `pnpm test:e2e` runs `apps/web/e2e` against the seeded demo hospital. Locally it reuses running servers, and `PLAYWRIGHT_CHANNEL=chrome` (or `msedge`) uses the installed browser instead of downloading one. CI runs it in its own job: Postgres in IST, migrate, seed, production build, the standalone web server as in Docker, and Playwright's Chromium.
- Reason: the smoke test exercises the real build and pipeline. The channel option avoids a browser download on developer machines.

## 2026-10-25: Phase 1 order and the admin setup slice

- Decision: phase 1 is built as one pull request per slice: admin setup, patient registration, billing and payments, OPD, IPD and the bed board, then discharge and reports. Pharmacy, lab and OT wait until phase 1 is done. Admin setup adds staff users, departments, doctors, room categories, wards and beds, service items with dated rates, and the hospital profile, with screens under `/settings`.
- Reason: agreed with the developer. Every later slice needs these masters (a doctor for OPD, a bed for IPD, a rate for billing).

## 2026-10-25: Who may read masters and rates

- Decision: every hospital role gets `masters.data.read` (departments, doctors, wards, beds, hospital details). `tariffs.tariff.read` goes to the hospital admin, MD, accountant, billing clerk, cashier and receptionist. Changing masters needs `masters.data.manage` (hospital admin); changing rates needs `tariffs.tariff.manage` (accountant). The hospital admin sees rates but cannot change them.
- Reason: front desk and ward staff need these lists to work, and none of them is sensitive. Rates are money, so they stay with finance, as in the role table of `CLAUDE.md`.

## 2026-10-25: Rates are dated and never edited

- Decision: a service item's rate lives in `tariff_rates` with `effective_from` and `effective_to` (IST calendar dates) and its own tax rate in basis points. A new rate must start today or later and after the current rate's start; the current rate is closed the day before. The service item row is locked (`SELECT ... FOR UPDATE`) while this happens, and a partial unique index allows one open rate per item. A trigger refuses DELETE and any UPDATE except closing an open rate.
- Reason: `CLAUDE.md` asks for `effective_from` and `effective_to` on every price and a rate snapshot on every charge. Never editing a past rate means a bill can always be explained from the rate history.

## 2026-10-25: Doctor logins are found by permission, not role name

- Decision: a doctor record may link to one staff login that holds `opd.queue.read-own`, is active and belongs to the same hospital. `GET /users?permission=<code>` lists such logins for the screen.
- Reason: section 8 says code checks permission codes, never role names, and the hospital admin may later make custom roles.

## 2026-10-25: Admins cannot change their own access

- Decision: `PATCH /users/:id` refuses a change to the caller's own roles or active flag, and `POST /users/:id/password` refuses the caller's own account (`SELF_CHANGE_NOT_ALLOWED`). Renaming yourself is allowed. Setting a password unlocks the account and ends every session of that user; deactivating a user ends their sessions too.
- Reason: an admin cannot lock themself out or raise their own access by mistake, and a password handed over by an admin takes effect at once.

## 2026-10-25: An occupied bed or ward is never retired

- Decision: retiring a bed is a conditional UPDATE that skips beds with status `occupied`, so a patient placed at the same moment cannot slip past a separate check (`BED_OCCUPIED`, 422). Retiring a ward checks for occupied beds in the same transaction. Free, cleaning and blocked are set on the bed board (IPD slice), not in settings.
- Reason: a retired bed with a patient in it would vanish from the bed board. The IPD slice must also check `is_active` on the bed and ward while holding the bed row lock.

## 2026-10-25: Settings screens

- Decision: `/settings` has one tab per section (`features/settings/sections.ts`), shown by permission. A section opened without its view permission is a 404 page; without its manage permission it is read-only. Lists are plain tables with search, a "show inactive" switch and paging, not TanStack Table. Selects are the browser's own `<select>`, and dialogs use Radix Dialog from the existing `radix-ui` package. Edit forms send only the fields that changed, and wait for their select options before they render, because a select takes its value when it first renders. Rupees and tax percentages are typed as text and turned into paise and basis points on the digits, never through floating point (`src/lib/money.ts`).
- Reason: master lists are short and need no column sorting yet; TanStack Table comes with the patient and billing lists. Native selects are light, keyboard friendly and need no new dependency. Sending only changed fields keeps the audit trail accurate.
