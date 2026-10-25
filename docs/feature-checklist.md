# Feature checklist

Progress against `CLAUDE.md`, section 11. Later phases need the developer's approval before they start.

Everything else needed before real patients (hosting, backups, audits, paperwork, cutover) is in `docs/go-live-checklist.md`, with the order to do it in.

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
- [x] Patient search in the top bar (with patient registration)
- [x] Settings and masters (admin setup slice): staff users and roles, hospital profile, departments, doctors, room categories, wards and beds, service items with dated rates, screens under `/settings`
- [ ] Custom roles screen (`users.role.manage`)
- [ ] Packages, discounts and other billing masters (waiting for answers in `docs/billing-rules.md`)
- [x] Patient registration: UHIDs from a gapless yearly counter, duplicate checks (Aadhaar and ABHA block, mobile and name warn), search by UHID, mobile, name, Aadhaar or ABHA, audited record views, edits
- [ ] Merging duplicate patient records, patient photo, printed UHID card
- [ ] Registration fee (waiting for an answer in `docs/billing-rules.md`)
- [ ] OPD
- [ ] IPD and beds
- [x] Billing (slice 3a): charges at the dated rate, draft bills, issue with gapless `INV` numbers per financial year, locked issued bills, discard, A4 and 80 mm print
- [x] Payments and cash shifts (slice 3a): one open shift per cashier, payments by cash, UPI, card, bank transfer or cheque, deposits, deposits set against bills, gapless `RCT` numbers, shift close with counted cash and a reason for any difference, shift list for finance
- [x] Discounts, refunds, credit notes and voids with maker-checker approvals (slice 3b): requests on bills and receipts, an approvals inbox, the MD-only finance limit for discounts, CN and RF numbers, refunds paid from the cashier's shift, A4 and 80 mm credit notes and refunds
- [ ] Day-end collection report and Tally export
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
