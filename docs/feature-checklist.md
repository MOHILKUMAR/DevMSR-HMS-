# Feature checklist

Progress against `CLAUDE.md`, section 11. Later phases need the developer's approval before they start.

## Foundation (first task)

- [x] pnpm monorepo: `apps/web`, `apps/api`, `packages/validation`, `packages/types`, `packages/config`
- [x] Docker Compose with PostgreSQL, Dockerfiles for `web` and `api`
- [x] `scripts/check-text.mjs`, pnpm scripts, CI (lint, typecheck, test, check:text, audit, Docker build), Dependabot
- [x] Prisma schema v0, with the approved additions: sessions, login events, idempotency keys, minimal wards and beds
- [x] Request pipeline: login with lockout, sessions, CSRF, rate limits, headers, permission matrix, guards, idempotency, exception filter, audit log
- [x] `pnpm db:migrate`, `pnpm db:seed`, `pnpm api:spec`
- [x] `pnpm test:e2e`: Playwright smoke test (redirect, keyboard sign-in, role menu, sign-out, errors)
- [x] Seed: fake hospital, staff for every role, wards, beds, 50 fake patients
- [x] Design tokens, fonts, session redirect (`proxy.ts`), `(auth)/login` and the `(app)` shell

## Phase 1

- [ ] Auth and roles: TOTP for super admin, hospital admin and finance; password reset; see and end own sessions; break-glass access; failed-login alert
- [ ] Separate database role for the API that cannot UPDATE, DELETE or TRUNCATE audit rows (before go-live)
- [ ] Idempotency key cleanup job (pg-boss)
- [ ] Tighter web CSP with nonces or SRI (before go-live)
- [ ] Patient search in the top bar (with patient registration)
- [ ] Settings and masters
- [ ] Patient registration
- [ ] OPD
- [ ] IPD and beds
- [ ] Billing
- [ ] Payments and cash shifts
- [ ] Discharge
- [ ] Basic reports
- [ ] Emailed bills

## Phase 2 (needs approval)

- [ ] Pharmacy
- [ ] Laboratory
- [ ] General store
- [ ] Nursing
- [ ] Department reports
- [ ] WhatsApp and SMS
- [ ] Live token and bed boards

## Phase 3 (needs approval)

- [ ] Insurance and TPA
- [ ] ABDM (M1 and M2)
- [ ] OT management
- [ ] Operation costing
- [ ] Management dashboard
