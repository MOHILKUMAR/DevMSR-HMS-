# DevMSR HMS: master prompt

Read this file at the start of every session. It is the single source of truth for how this project is built. If a request conflicts with this file, stop and ask before writing code.

## 1. What we are building

DevMSR HMS is a hospital management system for one pilot hospital in India (50 to 200 beds), designed so it can later serve more hospitals. One developer builds it with Claude Code.

- Users: receptionist, billing clerk, cashier, nurse, doctor, pharmacist, lab technician, accountant, hospital admin, owner (MD), and a DevMSR super admin for platform setup.
- Platform: a web app used in desktop browsers at counters and wards. No desktop app and no store mobile app in v1.
- Goal of v1: the hospital runs registration, OPD, IPD, billing, payments and discharge on this system every day.
- What makes it better than existing products:
  1. Operation costing: estimate versus actual cost and profit by procedure, surgeon and OT.
  2. A light, fast app on weak hospital internet (first load under 1 MB of JavaScript, first paint under 1.5 s on 4 Mbps).
  3. Provable billing: locked invoices, gapless numbers, approvals and a full audit trail.
  4. Published backup, recovery and security practices.

## 2. How to work

1. Before any change that touches more than 3 files or the database schema, write a short plan and wait for approval.
2. Build in vertical slices: migration, API endpoint, screen, tests, seed data. Finish one slice before starting the next.
3. After every change run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm check:text`. Fix every failure before reporting done.
4. Never invent hospital rules: rates, discounts, taxes, package contents, approval limits, numbering formats. If `docs/billing-rules.md` does not answer it, ask.
5. Work on a feature branch and open a pull request. Never push to `main`. Never deploy to production; the developer triggers production deploys.
6. Record every non-obvious decision in `docs/decisions.md` (date, decision, reason).
7. Report briefly: what changed, how it was tested, what is left.
8. Ask before adding any new dependency or third-party service.

## 3. Tech stack

- Language: TypeScript everywhere, `strict` mode, no `any`.
- Monorepo: pnpm workspaces with `apps/web`, `apps/api`, `packages/validation`, `packages/types`, `packages/config`.
- Frontend: Next.js (App Router) with React, TanStack Query, TanStack Table, React Hook Form, Zod, Tailwind CSS, shadcn/ui, lucide-react icons, next-intl (English now, Hindi later), `next/font` for self-hosted fonts.
- Backend: NestJS, Prisma, PostgreSQL 16 or later, pg-boss for background jobs, pino for logs, argon2 for passwords, otplib for two-factor codes, helmet, `@nestjs/throttler`, PDFKit for bills and receipts.
- Tests: Vitest for unit and integration tests, Playwright for end-to-end tests.
- Hosting: Next.js built with `output: 'standalone'` and the NestJS API, each in its own Docker container on the same server, behind Caddy (`app.` domain to Next.js on port 3000, `api.` domain to NestJS on port 4000). Oracle Cloud VM during development, a paid host in production. PostgreSQL on Supabase used only as plain PostgreSQL through Prisma (no Supabase Auth, Storage or REST APIs). Files and backups on Cloudflare R2.
- Do not add: Electron, Redis, BullMQ, microservices, GraphQL, Kubernetes, Vercel-only features, or any paid service, unless the developer approves it.

### Next.js rules

- Next.js is the UI layer only. `apps/web` never imports Prisma or talks to the database. Every read and write goes through the NestJS API.
- No business rules in Server Actions or Route Handlers. If they exist at all, they only forward to the NestJS API.
- Server Components for read-only pages (lists, reports, patient summary). They call the API at `API_INTERNAL_URL` and forward the session cookie.
- Client Components with TanStack Query for interactive counter screens: registration, billing, payments, bed board, queues.
- `middleware.ts` only redirects to `/login` when there is no session cookie. The API does the real permission checks.
- Keep client JavaScript small: dynamic import for heavy pieces (PDF preview, charts, rich text). Check bundles with `@next/bundle-analyzer` before every release.
- Use route groups: `(auth)` for login, `(app)` for the signed-in shell.

## 4. Architecture and request pipeline

The API is a modular monolith with a layered design. It is close to MVC, with stricter separation:

| Layer | Where | Job |
| --- | --- | --- |
| View | Next.js (`apps/web`) | Screens only |
| Controller | `<name>.controller.ts` | Read the request, call one service method, return the result |
| Service | `<name>.service.ts` | Business rules and transactions |
| Repository | `<name>.repository.ts` | Prisma queries, always filtered by `hospital_id` |
| Adapters | `apps/api/src/integrations` | Talk to vendors behind interfaces (ports and adapters) |

Every request passes through this pipeline, in this order. Never bypass a step.

1. Caddy terminates HTTPS and forwards to the API.
2. Middleware: request ID, pino logging with patient fields redacted, helmet security headers, CORS limited to the web domain.
3. Rate limiter (`@nestjs/throttler`).
4. Auth guard: reads the session cookie, loads the user and `hospitalId`, rejects expired or revoked sessions.
5. CSRF check on every state-changing request.
6. Permission guard: the route's `@RequirePermission('code')` decorator. Routes are denied by default. A route without a permission must be marked `@Public()` and reviewed.
7. Validation pipe: the Zod schema from `packages/validation`. Invalid input returns 400.
8. Idempotency interceptor on financial POST routes: a repeated `Idempotency-Key` returns the stored response.
9. The controller calls one service method.
10. The service applies the business rules inside one transaction when more than one record changes, writes `audit_events`, and queues outbox jobs in the same transaction.
11. The repository queries through Prisma with the `hospital_id` filter.
12. The exception filter returns `{ "error": { "code", "message", "details" } }` and never leaks stack traces, SQL or another hospital's data.

## 5. Repository layout

```
apps/
  web/src/
    app/
      (auth)/login/      login page
      (app)/             signed-in shell: sidebar, search bar, work area
        patients/ opd/ ipd/ beds/ billing/ payments/ discharge/ reports/ settings/
      globals.css        design tokens
      layout.tsx         fonts, providers
    features/<module>/   client components, hooks and API calls per module
    components/ui/       shadcn/ui components
    lib/                 formatting, api client, auth helpers
    messages/en.json, messages/hi.json
    middleware.ts
  api/src/
    auth/ users/ patients/ opd/ ipd/ beds/ billing/ payments/ discharge/
    pharmacy/ lab/ ot/ costing/ reports/ audit/ numbering/ tariffs/
    files/ notifications/ integrations/ common/
packages/
  validation/            Zod schemas shared by web and api
  types/                 shared TypeScript types
  config/                eslint, tsconfig, tailwind presets
prisma/
  schema.prisma  migrations/  seed.ts
scripts/
  check-text.mjs
docs/
  billing-rules.md  decisions.md  api.md  feature-checklist.md  api-collection/
```

Every API module has `<name>.module.ts`, `<name>.controller.ts`, `<name>.service.ts`, `<name>.repository.ts`, a `dto/` folder and `<name>.service.spec.ts`. Controllers only parse input and call services. Business rules live in services. Database access lives in repositories.

## 6. Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs web and api in watch mode |
| `pnpm db:migrate` | Creates and applies a migration in development |
| `pnpm db:seed` | Loads fake hospital data |
| `pnpm test` | Unit and integration tests |
| `pnpm test:e2e` | Playwright tests |
| `pnpm lint` and `pnpm typecheck` | ESLint and TypeScript checks |
| `pnpm check:text` | Fails if any file contains an em dash or en dash |
| `pnpm api:spec` | Regenerates the OpenAPI file and the typed client for `apps/web` |

## 7. Rules that must never be broken

### Data

- Primary keys are UUIDs.
- Money is stored as integer paise (`BigInt` columns named `*_paise`). Never use floating point for money. Format only for display.
- Timestamps are stored in UTC (`timestamptz`) and shown in `Asia/Kolkata`.
- Every business table has `hospital_id`, and `branch_id` where relevant. Every query filters by it inside the repository layer.
- Database names are snake_case through Prisma `@map` and `@@map`. TypeScript names are camelCase.
- Clinical and financial records are never hard deleted.
- Never edit a migration that has already been applied. Create a new one.

### Billing and money

- Every charge stores a snapshot of the rate, tax and tariff version used.
- Issued invoices are immutable. A database trigger blocks `UPDATE` and `DELETE` on issued invoices. Corrections are credit notes.
- Invoice and receipt numbers are gapless per financial year (April to March), taken from a locked counter row inside the same transaction.
- Every request that creates a charge, payment, refund or invoice needs an `Idempotency-Key` header.
- Multi-record financial writes run in one database transaction.
- Discounts, refunds, voids and package overrides need an approval record (approver, reason, time) from a second user who has the permission.
- Deposits are not revenue. They are allocated against invoices.
- A bed can have only one active assignment: partial unique index on `(bed_id) WHERE ended_at IS NULL`.

### Security and privacy

- Every endpoint is protected by guards with permission codes such as `billing.discount.approve`.
- Every input is validated with Zod schemas from `packages/validation`.
- No patient names, phone numbers, Aadhaar or ABHA numbers in URLs, logs, error messages or Sentry events. Use UUIDs in URLs.
- Aadhaar and ABHA numbers are encrypted at field level and shown masked (last 4 digits only).
- Secrets live only in environment variables. Never commit, print or log them.
- Every financial change and every patient record view writes an `audit_events` row. The app's database user cannot delete audit rows.
- Development and tests use fake seed data only. Never real patient data.
- Live API keys are used only in production. Mock adapters are the default everywhere else.
- Sessions, login, rate limits, headers and server hardening follow the "Security controls" section exactly.

## 8. Roles and permissions

- Roles are bundles of permission codes in the form `module.resource.action`, for example `billing.invoice.issue`. Code checks permission codes, never role names.
- Seed these roles. The hospital admin can later create custom roles from permission codes.

| Role | Can | Cannot |
| --- | --- | --- |
| Super admin (DevMSR platform) | Create and configure hospitals, emergency fixes | Daily hospital work. Opens patient records only through logged break-glass access with a reason. Two-factor required |
| Hospital admin | Users, roles, masters, settings | Approve their own discounts, refunds or voids |
| MD or owner | All reports including profit, final approvals, every refund approval, discounts above the finance limit | |
| Finance head or accountant | Tariffs, cost rates, credit note approval, discounts up to the hospital's limit, Tally export, collection reports | Approve refunds (MD only, docs/billing-rules.md); edit issued invoices (nobody can) |
| Billing clerk | Charges, interim and final bills, discount requests | Approve discounts, refunds or voids |
| Cashier | Receipts, deposits, own cash shift | See or close other cashiers' shifts |
| Receptionist | Registration, appointments, tokens, admission | Change charges or bills |
| Doctor | Own queue, notes, orders, mark fit for discharge | Billing, settings |
| Nurse | Ward view, bed status, returns, vitals | Billing, settings |
| Pharmacist, lab technician, OT coordinator | Their own department (phases 2 and 3) | Other departments |

- Maker-checker: the user who requests a discount, refund, void or package override can never approve it.
- Object-level checks: every `:id` lookup checks `hospital_id` and permission. A record from another hospital returns 404, not 403, so its existence is not revealed.
- Break-glass access (super admin or emergency): needs a written reason, expires after 1 hour, writes an audit event and notifies the hospital admin.
- The permission matrix lives in `apps/api/src/auth/permission-matrix.ts`. It seeds roles and permissions and drives the permission matrix test.

## 9. Security controls

| Area | Rule |
| --- | --- |
| Rate limits | Starting values, kept in config: login 5 per minute per username and IP; OTP send 3 per 10 minutes per user; password reset 3 per hour; exports and PDF generation 10 per hour per user; general API 300 per minute per user; webhooks 600 per minute per provider. Return 429 with a `Retry-After` header |
| Login | Argon2id. Lock the account for 15 minutes after 5 failed attempts. Two-factor (TOTP) for super admin, hospital admin and finance roles. Record every successful and failed login |
| Sessions | Server-side sessions in the database so they can be revoked. httpOnly, Secure, SameSite=Lax cookies. 15 minute idle timeout, 12 hour maximum. New session ID at every login. Users can see and end their own sessions |
| CSRF | Double-submit CSRF token on every POST, PUT, PATCH and DELETE |
| Headers | helmet on the API and the same headers from Next.js: HSTS, Content-Security-Policy, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy |
| Input and output | Zod on every input. Response DTOs list exactly which fields are returned. Never return password hashes, secrets or another hospital's data |
| Files | PDF, JPG and PNG only, 10 MB maximum, content type checked, random file names, private bucket, signed links that expire after 5 minutes |
| Data | HTTPS everywhere. Field encryption for Aadhaar and ABHA. Encrypted backups. Secrets only in environment variables |
| Money integrity | Idempotency keys, locked invoices, gapless numbers, transactions, signed and recorded webhooks |
| Monitoring | Audit log, login history, an alert on more than 20 failed logins in 10 minutes, Sentry with patient data removed, logs kept 180 days in India (CERT-In) |
| Supply chain | Lockfile committed, Dependabot, `pnpm audit` in CI, no new dependency without approval |
| Server | Docker containers run as non-root users. Only Caddy exposes ports 80 and 443. SSH by key only. Database reachable only through an IP allowlist. Cloudflare proxy in front of the domains |
| Before go-live | VAPT by a CERT-In empanelled auditor. Fix every high and critical finding before real patients |

## 10. API design

- REST under `/api/v1`, plural nouns, kebab-case paths, JSON bodies in camelCase.
- Actions are sub-resources: `POST /invoices/:id/issue`, `POST /admissions/:id/transfers`, `POST /discounts/:id/approve`.
- Lists: `?page=1&pageSize=50&sort=createdAt:desc` plus filters. List responses: `{ "data": [...], "page", "pageSize", "total" }`.
- Errors: `{ "error": { "code", "message", "details" } }` with codes such as `VALIDATION_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `INVOICE_LOCKED`, `BED_TAKEN`.
- Status codes: 200, 201, 400, 401, 403, 404, 409 (conflict, such as a bed already taken), 422 (business rule failed), 429 (rate limited).
- OpenAPI is generated from the Zod schemas. Swagger UI runs in development only.
- A typed client for `apps/web` is generated from the OpenAPI file, so an API change breaks the web build instead of the billing counter.
- Breaking changes go to `/api/v2`. `/api/v1` keeps working until the web app has moved.

Planned endpoints (estimates; `docs/api.md` holds the real list):

| Phase | Groups | Endpoints |
| --- | --- | --- |
| 1 | Auth 8, users and roles 10, settings and masters 25, patients 8, OPD 10, IPD and beds 12, billing 14, payments and shifts 10, discharge 5, reports 6, audit, files, dev inbox, webhooks and health 11 | about 110 to 130 |
| 2 | Pharmacy, lab, store, nursing, live boards, WhatsApp and SMS | about 60 more |
| 3 | TPA, ABDM, OT, costing, dashboard | about 50 more |

Example flow, IPD discharge billing:

1. `GET /admissions/:id/interim-bill`
2. `POST /invoices` (a draft built from the admission's charges)
3. `POST /invoices/:id/issue` with an `Idempotency-Key`
4. `POST /payments` for the balance, or `POST /refunds` for excess deposit (needs approval)
5. `GET /invoices/:id/pdf`
6. `POST /discharges/:id/clearance`

## 11. Modules and phases

- Phase 1 (build now): auth and roles, settings and masters, patient registration, OPD, IPD and beds, billing, payments and cash shifts, discharge, basic reports, emailed bills.
- Phase 2: pharmacy, laboratory, general store, nursing, department reports, WhatsApp and SMS, live token and bed boards.
- Phase 3: insurance and TPA, ABDM (M1 and M2), OT management, operation costing, management dashboard.

Track progress in `docs/feature-checklist.md`. Do not start a later phase feature without approval.

## 12. Core workflows

- OPD: search or register patient (with duplicate check) → token → consultation fee paid → doctor queue → orders post charges automatically → follow-up date or admission request.
- IPD: admission (payer type, room category, advance deposit, bed) → room and nursing charges posted by the worker at midnight IST → department charges posted as they happen → interim bills on request → transfers close the old bed assignment and open a new one.
- Discharge: doctor marks fit → unused medicines returned and credited → final bill issued and locked → cashier settles balance or refunds excess deposit → billing clearance → discharge summary → bed set to cleaning, then free.
- Cash: each cashier opens a shift with opening cash and closes it with a counted tally. Day-end collection report goes to the accountant and to the Tally export.

## 13. Operation costing rules (phase 3)

- Billing and costing are separate engines fed by the same OT case record.
- Bills always use the approved tariff (package price or itemised fee schedule), never the live cost.
- Direct cost = staff + OT room + consumables + medicines + implants + equipment + sterilisation. Full cost = direct cost + allocated overheads.
- Salaried staff: hourly cost × minutes in OT. Visiting doctors: their actual payout rule.
- Consumables and medicines: quantity issued minus quantity returned, at the purchase cost of the batch.
- Never count equipment twice if the OT room rate already includes it.
- Produce an estimate before surgery and an actual after it. Flag large variances. Finalise as a versioned cost snapshot.
- All prices and cost rates carry `effective_from` and `effective_to`.
- Cost sheets and profit reports are visible only to finance and the MD.

## 14. Integrations

- Core modules never call vendors directly. They call interfaces in `apps/api/src/integrations`: `PaymentGateway`, `MessageSender`, `AbdmGateway`.
- Each interface has a mock adapter (the default) and real adapters added when keys exist: Razorpay, a WhatsApp provider, an SMS provider (DLT registered), Resend, ABDM.
- The adapter is chosen by environment variables: `PAYMENTS_PROVIDER`, `WHATSAPP_PROVIDER`, `SMS_PROVIDER`, `EMAIL_PROVIDER`, `ABDM_MODE`.
- Every outgoing message and payment link goes through the pg-boss outbox with an idempotency key.
- Webhooks: verify the signature, store the raw event in `webhook_events`, process idempotently.
- Message templates (WhatsApp, DLT SMS, email) are rows in a `message_templates` table, not hard-coded strings.
- In mock mode, messages appear in a dev inbox screen and bills show a "Simulate payment" button. The API refuses to start in production if any mock adapter is enabled.
- Billing emails: subject and body contain only the hospital name, bill number, date and amount. The itemised bill is attached as a password-protected PDF.
- The same contract tests run against the mock adapter and the real adapter.

## 15. Environment variables

Keep `.env.example` up to date with placeholder values. Real values are filled in by the developer only.

```
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:3000
LOG_LEVEL=info
DATABASE_URL=
DIRECT_URL=
SESSION_SECRET=
FIELD_ENCRYPTION_KEY=
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_FILES=hms-files
SENTRY_DSN=
PAYMENTS_PROVIDER=mock
WHATSAPP_PROVIDER=mock
SMS_PROVIDER=mock
EMAIL_PROVIDER=mock
ABDM_MODE=off
MAIL_ENABLED=false
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
MAIL_FROM=
MAIL_REPLY_TO=
```

Frontend (`apps/web/.env.local`):

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
API_INTERNAL_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_APP_ENV=development
```

`NEXT_PUBLIC_API_URL` is what the browser calls. `API_INTERNAL_URL` is what Server Components call from inside the server (in Docker, the API container's name, for example `http://api:4000/api/v1`). Anything starting with `NEXT_PUBLIC_` is sent to every browser, so never put a secret there.

## 16. Design system

Look and feel: calm, clinical and high contrast. Dense where staff work fast (billing, queues, tables), roomy on long forms. Light theme by default, dark theme for night shifts.

### Colours

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `primary` | `#0F766E` | `#2DD4BF` | Main buttons, links, active navigation, focus ring |
| `primary-hover` | `#115E59` | `#5EEAD4` | Hover on primary |
| `primary-soft` | `#F0FDFA` | `#042F2E` | Selected rows, active filters |
| `background` | `#F8FAFC` | `#020617` | Page background |
| `surface` | `#FFFFFF` | `#0F172A` | Cards, tables, dialogs |
| `border` | `#E2E8F0` | `#1E293B` | Lines and dividers |
| `text` | `#0F172A` | `#F1F5F9` | Main text |
| `text-muted` | `#475569` | `#94A3B8` | Labels, help text, metadata |
| `success` | `#15803D` | `#4ADE80` | Paid, bed free, normal result |
| `warning` | `#B45309` | `#FBBF24` | Low deposit, cleaning, near expiry |
| `danger` | `#B91C1C` | `#F87171` | Amount due, abnormal result, destructive actions |
| `info` | `#1D4ED8` | `#60A5FA` | Occupied bed, information |
| `accent` | `#6D28D9` | `#A78BFA` | Reserved bed, credit notes |

- Soft status backgrounds (light theme): success `#F0FDF4`, warning `#FFFBEB`, danger `#FEF2F2`, info `#EFF6FF`, accent `#F5F3FF`, neutral `#F1F5F9`.
- Bed board: Free = success, Occupied = info, Cleaning = warning, Reserved = accent, Blocked = text-muted.
- Status is never shown by colour alone. Always pair colour with an icon and a word.
- Use one primary button per screen. Other actions use outline or ghost buttons.
- Define all colours as CSS variables in `apps/web/src/app/globals.css` (shadcn/ui convention) and reference them through Tailwind. Never hard-code hex values in components.

### Typography

- Font: Inter with weights 400, 500 and 600, loaded through `next/font/google` so it is self-hosted with no request to Google at runtime. Hindi text: Noto Sans Devanagari as the fallback font, loaded the same way. Codes such as UHID, IPD and invoice numbers: the monospace font.
- Scale (px): 12 caption, 14 tables and dense screens, 16 forms and body text, 18 section headings, 20 page titles, 24 dashboard headings, 30 key figures.
- Line height: 1.5 for body text, 1.25 for headings.
- Numbers: `font-variant-numeric: tabular-nums`, right aligned in tables.
- Money: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`, which shows ₹1,23,456.00.
- Dates and times: `24 Oct 2026, 10:30 am` in IST. Date only in forms: `24/10/2026`.
- Billing counter inputs: at least 16px text and 40px height. The full flow must work from the keyboard.

### Layout and accessibility

- Spacing on a 4px grid. Corner radius 6px. Focus ring 2px in `primary` with a 2px offset.
- Meet WCAG 2.1 AA: text contrast of at least 4.5:1, every action reachable by keyboard, visible focus, labels on every input.
- Left sidebar navigation filtered by role, a global patient search bar at the top, the work area in the middle.
- Print layouts for bills, receipts and discharge summaries: black text on white, hospital header with logo, A4 and 80 mm thermal versions.

### Writing in the UI

- Sentence case for buttons, labels, headings and menus.
- Short, plain Indian English. Verb first on buttons: "Issue bill", "Admit patient", "Print receipt".
- Errors say what happened and what to do next. Never show raw error messages to staff.
- All UI strings live in `messages/en.json` (next-intl) so Hindi can be added later.

## 17. Text and code style

- Never use the em dash (U+2014) or the en dash (U+2013) anywhere: code, comments, UI strings, seed data, docs, commit messages and pull request text. Use a hyphen (-), a comma, a colon, the word "to" for ranges, or start a new sentence.
- `pnpm check:text` enforces this rule. It runs `scripts/check-text.mjs`:

```js
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|css|json|md|prisma|sql|html|yml|yaml)$/.test(f));

const forbidden = /[\u2013\u2014]/;
let failed = false;

for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (forbidden.test(line)) {
      console.error(`${file}:${i + 1}: em dash or en dash found`);
      failed = true;
    }
  });
}

process.exit(failed ? 1 : 0);
```

- Run `pnpm check:text` in CI on every pull request.
- File names in kebab-case. React components in PascalCase. Hooks start with `use`. Constants in UPPER_SNAKE_CASE. Prefer named exports.
- API conventions follow the "API design" section.
- Comments explain why, not what.

## 18. Testing and definition of done

| Layer | Tool | What must be covered |
| --- | --- | --- |
| Unit | Vitest | All money logic: tariffs, discounts, tax, rounding, deposits, refunds, costing |
| API integration | Supertest against the real NestJS app and a real PostgreSQL in Docker | For every endpoint: success, 400 invalid input, 401 no session, 403 missing permission, 404 for another hospital's record, idempotent replay on financial routes, 429 on rate-limited routes |
| Concurrency | Vitest with parallel requests | Two users allocating the same bed, gapless invoice numbers under load, double payment submits |
| Permission matrix | Generated from `permission-matrix.ts` | Every route called as every role returns exactly the expected status |
| Contract | OpenAPI snapshot and the generated client | The web app and the API agree |
| End to end | Playwright | Register a patient, OPD visit with receipt, admit, transfer, final bill, discharge |
| Security scan | OWASP ZAP baseline against staging in CI | Missing headers and common web flaws |
| Load | k6 | Billing counter at peak, before go-live |
| Manual | Bruno collection in `docs/api-collection/` | Exploring endpoints by hand, kept in git |

A feature is done when: tests pass; lint, typecheck and check:text are clean; new routes are in the permission matrix; audit events are written; seed data covers it; `docs/api.md`, the OpenAPI file and `.env.example` are updated; the pull request says how it was tested.

## 19. Never do this

- Store money as a float or format money in the database.
- Bypass the repository layer's `hospital_id` filter.
- Log request bodies on patient, billing or payment endpoints.
- Call a vendor API from anywhere except `apps/api/src/integrations`.
- Use real patient data or live keys outside production.
- Add a feature outside the current phase without approval.
- Add a route without `@RequirePermission(...)` or a reviewed `@Public()`.
- Return 403 for another hospital's record. Return 404.
- Let the same user request and approve a discount, refund, void or package override.
- Use an em dash or an en dash.

## 20. First task

1. Create the pnpm monorepo with `apps/web` (Next.js App Router, `output: 'standalone'`), `apps/api` (NestJS) and the three packages.
2. Add Docker Compose with PostgreSQL for local development, and Dockerfiles for `web` and `api`.
3. Add the Prisma schema v0: `hospitals`, `branches`, `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `patients`, `audit_events`.
4. Build the request pipeline end to end: login with lockout, server-side sessions, CSRF, rate limiting, security headers, the permission matrix with the seeded roles, permission guards, the idempotency interceptor, the exception filter and the audit log. Cover it with API tests and the permission matrix test.
5. Add `scripts/check-text.mjs`, the `pnpm` scripts above, and a CI workflow that runs lint, typecheck, tests and check:text.
6. Add the design tokens to `globals.css`, the fonts in `layout.tsx`, `middleware.ts`, and the `(app)` shell: sidebar, top search bar, work area.
7. Write the seed script with a fake hospital, staff users for every role, wards, beds and 50 fake patients.
