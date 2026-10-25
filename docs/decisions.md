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

- Decision: retiring a bed is a conditional UPDATE that skips beds with status `occupied`, so a patient placed at the same moment cannot slip past a separate check (`BED_OCCUPIED`, 422). Retiring a ward first locks all its beds (`SELECT ... FOR UPDATE`), then counts occupied ones, in the same transaction. Free, cleaning and blocked are set on the bed board (IPD slice), not in settings.
- Reason: a retired bed with a patient in it would vanish from the bed board. The IPD slice must lock the bed row before filling it, then check `is_active` on the bed and the ward: an admission and a ward retirement then always run one after the other. An API test holds a bed lock mid-admission and checks that the retirement waits and is refused.

## 2026-10-25: Settings screens

- Decision: `/settings` has one tab per section (`features/settings/sections.ts`), shown by permission. A section opened without its view permission is a 404 page; without its manage permission it is read-only. Lists are plain tables with search, a "show inactive" switch and paging, not TanStack Table. Selects are the browser's own `<select>`, and dialogs use Radix Dialog from the existing `radix-ui` package. Edit forms send only the fields that changed, and wait for their select options before they render, because a select takes its value when it first renders. Rupees and tax percentages are typed as text and turned into paise and basis points on the digits, never through floating point (`src/lib/money.ts`).
- Reason: master lists are short and need no column sorting yet; TanStack Table comes with the patient and billing lists. Native selects are light, keyboard friendly and need no new dependency. Sending only changed fields keeps the audit trail accurate.

## 2026-10-25: A scheduled rate can be cancelled before it starts

- Decision: `POST /service-items/:id/rates/:rateId/cancel` (finance, `tariffs.tariff.manage`) cancels the latest rate if it has not started (IST), with a reason of 3 to 200 characters. The row is kept with `cancelled_at`, `cancelled_by_id` and `cancel_reason`, and never applies; the rate it would have replaced is reopened in the same transaction. A rate that has started, one followed by a later rate, or one already cancelled is refused (`RATE_NOT_CANCELLABLE`); cancel the later rate first. The database trigger allows exactly three changes: closing an open rate, cancelling a rate that has not started, and reopening a rate whose end date has not passed and that no rate follows. A cancelled rate never changes again. No second approver is needed.
- Reason: without it a mistyped future rate could only be replaced by an even later one, leaving the wrong amount in force for the days between. Nothing has been charged at a rate that has not started, so this is a correction of a plan, not a void of a financial record (voids, discounts and refunds still need maker-checker approval). The history screen shows every rate as In force, Scheduled, Ended or Cancelled, with the reason.

## 2026-10-25: Form fields get their own border colour

- Decision: text boxes and selects use a new token, `--input-border` (`#64748B` in both themes), instead of `--border`. Lines and dividers keep the section 16 `--border`.
- Reason: section 16 asks for WCAG 2.1 AA, and a field's outline needs 3:1 against its background (WCAG 1.4.11). `--border` gives about 1.2:1 in both themes, so fields on cards and dialogs, like the sign-in form in dark theme, were close to invisible. `#64748B` gives 4.8:1 on white and 3.8:1 on the dark surface.

## 2026-10-25: Dropdowns load every page

- Decision: dropdowns of departments, room categories, doctors and doctor logins load every page of active records (`src/lib/api/all-pages.ts`), up to 20 pages of 100.
- Reason: lists cap a page at 100, and a dropdown that shows only the first page silently hides the rest. Up to 2,000 choices is far beyond one hospital; a searchable picker can replace a dropdown if a list grows past a few hundred.

## 2026-10-25: `pnpm api:spec` builds outside `dist`

- Decision: `pnpm api:spec` compiles the API with `tsc` into `apps/api/.spec-build` (git-ignored, deleted afterwards) and runs the spec generator from there, instead of `nest build`.
- Reason: `nest build` empties `apps/api/dist`, which the API in a running `pnpm dev` loads from, so regenerating the spec used to stop the dev API.

## 2026-10-25: UHIDs come from a locked counter row

- Decision: `number_counters` holds one row per hospital, number kind and period (the calendar year in IST for UHIDs). A registration takes its number with `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` inside its own transaction, which locks the row until the registration commits or rolls back, so numbers are gapless and never repeat. A trigger only lets a counter move up by exactly one and refuses deletes; another trigger keeps a patient's UHID, hospital and registration fixed. The 50 seeded patients were numbered by the migration in registration order. Invoice and receipt series will reuse the table once their formats are decided.
- Reason: `CLAUDE.md` asks for gapless numbers from a locked counter row in the same transaction, and `docs/billing-rules.md` fixes the UHID format. An API test registers 20 patients at once and checks they get 1 to 20.

## 2026-10-25: Patient search is a POST, and the search text is never stored

- Decision: `POST /patients/search` takes the search text in the body. The screen keeps it in the page, never in the address bar. The audit event records how the search ran (UHID, mobile, name, Aadhaar, ABHA) and how many records were shown, never what was typed. Aadhaar and ABHA searches compare blind indexes, so numbers are never decrypted to search.
- Reason: section 7 forbids names and phone numbers in URLs and logs. A GET with `?q=` would put them in browser history, proxy logs and the Referer header.

## 2026-10-25: Duplicate patients

- Decision: as decided with the developer (`docs/billing-rules.md`), the same Aadhaar or ABHA number as an existing patient of the hospital is refused (`DUPLICATE_PATIENT`), backed by unique indexes on the blind indexes so two registrations at the same moment cannot both win. The same mobile, or the same name with a birth year within one year, is a warning: the registration form shows the matches and staff can register a new patient anyway, which the API only accepts with `acknowledgedDuplicateIds`. Error details carry only patient IDs and UHIDs; names come from `POST /patients/duplicate-check`, a normal response for staff allowed to register.
- Reason: duplicate records split a patient's history and bills, but families in India often share one mobile, so only identity numbers can safely block. Section 7 keeps names out of error messages.

## 2026-10-25: Registration details

- Decision: mobile numbers are stored as E.164 (`+91` and 10 digits) whatever way they are typed. Aadhaar numbers must pass the Verhoeff check digit. When only an age is given, the date of birth is estimated (same day and month, that many years back) and flagged as estimated. Registration needs an `Idempotency-Key`, so a double click or a retried request returns the same patient. A patient's record page is a Server Component and every view is audited; the edit screen sends only changed fields and never shows Aadhaar or ABHA in full, so an empty box keeps the number on record.
- Reason: one stored form makes mobile duplicate checks exact. The check digit catches typing mistakes before a wrong Aadhaar is saved. Registration creates a numbered record, so it gets the same protection against double submits as financial routes.

## 2026-10-25: Bills are drafted from charges, numbered at issue and then locked

- Decision: a charge is posted at the rate and tax rate in force on its service date, and stores both, the rate row it came from, and its amount. A bill starts as a draft that takes chosen pending charges (one line per charge, with its own CGST and SGST). Issuing it takes the next `INV` number for the financial year from `number_counters` in the same transaction, snapshots the hospital and patient details as printed, marks the charges billed and locks the bill. A draft is never edited: it is issued, or discarded, which lets its charges go. Database triggers enforce all of this whoever writes: a charge can only be attached, released or marked billed; an issued or discarded bill never changes; lines, receipts and allocations are append only; nothing is deleted or truncated.
- Reason: section 7 asks for rate snapshots, immutable issued bills and gapless numbers per financial year. Numbering at issue (not at draft) keeps the series gapless when drafts are discarded. The snapshots mean a reprint years later shows what the patient was given, even after the hospital's address or the patient's details change. A test issues 10 bills at once and checks they get consecutive numbers.

## 2026-10-25: Money at the counter goes through a cashier's own shift

- Decision: payments and deposits are receipts with a gapless `RCT` number, and each must land in an open shift of the cashier taking it; a trigger checks this with the shift row locked, so a receipt and the shift's closing never cross. A cashier has one open shift at a time (partial unique index). The cash expected in the drawer is the opening cash plus the shift's cash receipts. Closing records the count, the difference and, if it differs, a reason of 3 to 200 characters; a closed shift never changes. Deposits are receipts held for the patient; setting one against a bill writes an allocation (oldest deposit first), needs no shift because no money moves, and a trigger keeps every allocation within what is left on the receipt and what is due on the bill. Payments, deposits, charges, drafts, issues and deposit use all need an `Idempotency-Key`; the screens make one key per form, so a double click or a resend after a lost response returns the first result.
- Reason: section 12 and `docs/billing-rules.md` describe shifts with a counted tally and deposits that are not revenue. Checking in the database as well as the service means a bug or a direct write cannot take money outside a shift or over-allocate a deposit.

## 2026-10-25: Who sees billing, and MD-only refunds

- Decision: a new permission, `billing.account.read`, covers reading charges, bills, receipts and a patient's account. The MD, finance, the billing clerk and the cashier hold it. The developer decided that only the MD or owner approves refunds, so `billing.refund.approve` was removed from the accountant role and the role table in `CLAUDE.md` was updated. Finance reads every cashier's shifts with `reports.collection.read`, and the Payments menu shows for that permission. Existing databases pick up role changes by running `pnpm db:seed` again, which syncs the seeded roles with the permission matrix.
- Reason: cashiers need to see bills to take payment and billing clerks need receipts to answer questions, without either getting the other's write permissions. Pages and links are hidden from staff without the permission, and the API refuses them anyway.

## 2026-10-25: Printed bills and receipts

- Decision: bills and receipts print from `/print/invoices/:id` and `/print/receipts/:id`, a route group without the app shell, as Server Components that fetch through the API. `?size=a4` (default) sets `@page` to A4 with every column; `?size=thermal` sets an 80 mm page and keeps description, quantity and amount. They use `--print-ink`, `--print-paper` and `--print-rule`, black on white in both themes, and open the print dialog on load (`?auto=0` turns that off for tests). Until the hospital confirms the GST wording, the title is "Bill" (an open question in `docs/billing-rules.md`).
- Reason: section 16 asks for black on white print layouts with the hospital header, in A4 and 80 mm. A separate page per size is simpler and more reliable than print media queries on the screen view, and needs no PDF library in the browser.

## 2026-10-25: The API runs as a database role that owns nothing

- Decision: a migration creates the group role `hms_api` (no login) and grants it SELECT, INSERT and UPDATE on every table, through `ALTER DEFAULT PRIVILEGES` for tables later migrations add. It has no UPDATE on `audit_events` and `login_events`, no access to `_prisma_migrations`, and DELETE only on `role_permissions`, `user_roles` and `idempotency_keys`, the rows the API removes. The API connects through `DATABASE_URL` as a login that is a member of `hms_api`, created per environment by `pnpm db:api-user` from the owner connection in `DIRECT_URL`. Migrations and `db:api-user` use `DIRECT_URL`. API tests do the same: the test setup creates a login named after the test database (`hms_test_api`) with a random password per run, the app connects as it, and trigger tests use the owner connection (`t.owner`) to show a trigger holds even for a role with every privilege. In production the API refuses to start if its user is a superuser, owns a table, can create objects or can change audit rows.
- Reason: the table owner can disable triggers, so append-only audit history was only as safe as the API's connection (the 2026-10-25 "Rules enforced by triggers" entry). Withholding DELETE everywhere else means a clinical or financial row cannot be deleted even where no trigger exists yet. Running tests as the restricted login makes a missing grant fail a test, not production.
- Watch out: a new table whose rows the API must delete needs an explicit `GRANT DELETE ... TO hms_api` in its migration. Supabase: create the login with `pnpm db:api-user` as `postgres`; through the pooler its user name is `hms_app.<project-ref>`.

## 2026-10-25: Production start-up guard and `APP_ENV`

- Decision: a new setting, `APP_ENV` (`development`, `staging` or `production`), says which deployment this is; it is required when `NODE_ENV` is `production`, and `APP_ENV=production` requires `NODE_ENV=production`. With `APP_ENV=production` the API refuses to start, naming the setting but never its value, when any vendor adapter is `mock`, `ABDM_MODE` is `mock`, `SENTRY_DSN` is missing, `SESSION_SECRET` and `FIELD_ENCRYPTION_KEY` are equal or look like placeholders (fewer than 16 distinct bytes), `DATABASE_URL` or `DIRECT_URL` uses the local or CI demo password, `SEED_USER_PASSWORD` is set, or a CORS origin is not `https://`. Then it checks the database role and the permission matrix (the entries before and after this one). The adapter settings accept only `mock` (and `off` for ABDM) until real adapters exist, so production cannot start before then. The seed also refuses `APP_ENV=production`.
- Reason: `CLAUDE.md` section 14 asks the API to refuse mock adapters in production, but staging must keep them (section 7: live keys only in production) while running a production build, so `NODE_ENV` alone cannot tell the two apart.

## 2026-10-25: Permission matrix changes reach live hospitals through `pnpm db:sync-roles`

- Decision: `pnpm db:sync-roles` (in the API container: `node dist/cli/sync-roles.js`) compares every hospital's seeded roles and the platform roles with `permission-matrix.ts` and prints the difference; `--apply` inserts new permission codes, grants and revokes in one transaction under an advisory lock, and writes one `auth.role.synced` audit event per changed role with the codes added and removed. It runs in every deploy after `pnpm db:deploy` and before the new API starts, as the API's own login. Custom roles are never touched, and codes dropped from the matrix stay in the table (reported) because a custom role may hold them. At start-up the API compares the roles with the matrix: production refuses to start while they differ; elsewhere it logs a warning.
- Reason: a migration cannot read the matrix, and an automatic sync at start-up would change who can do what without anyone seeing it. A separate step shows the change first, and the start-up check stops a release that skipped it.

## 2026-10-25: Content-Security-Policy with nonces

- Decision: `src/proxy.ts` now has a second job: on every page request it makes a 128-bit nonce and sets `script-src 'self' 'nonce-...' 'strict-dynamic'` on the request (Next.js reads it there and adds the nonce to its own scripts) and on the response. `'unsafe-inline'` is gone from scripts; `'unsafe-eval'` stays in development only. The proxy now also runs for `/login` (without the redirect). Styles keep `'unsafe-inline'`, since React style attributes cannot carry a nonce. The other security headers stay in `next.config.ts`. `CLAUDE.md` section 3 was updated with the developer's approval of the stage 4 plan.
- Reason: closes the "Revisit before go-live" in "Content-Security-Policy without nonces". Every page is already rendered per request (the root layout reads the theme cookie), so nonces cost nothing. Checked on a production build: all 16 scripts on the login page carry the nonce, sign-in works, and an injected `onerror` handler is blocked.
