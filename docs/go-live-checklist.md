# Go-live readiness checklist

Everything that must be true before the pilot hospital uses DevMSR HMS with real patients, and the order to do it in. Feature progress is tracked in `docs/feature-checklist.md`; this file covers the features and everything else around them. Written on 2026-10-25, when the latest work was PR 7 (billing core).

Owners: **Dev** (the developer with Claude Code), **Hospital** (MD, accountant or admin), **Legal** (the hospital's legal adviser), **Auditor** (a CERT-In empanelled auditor).

Ticked items are done. "Partly" says what already exists.

## Where things stand

- Built: the foundation (sign-in, sessions, permissions, audit log, CI), admin setup, patient registration, and the billing core (bills, receipts, deposits, cash shifts). All of it is in open pull requests: `main` has none of it yet.
- Not built: slices 3b to 6, PDF and emailed bills, the security features in stage 4, and all hosting and operations.
- Never tried: a production deployment, a backup restore, a load test, an external security audit.

## The order

| Stage | What | When |
| --- | --- | --- |
| 1 | Merge the open work | Now |
| 2 | Hospital decisions | Start now, runs alongside stages 3 to 6 |
| 3 | Finish phase 1 features | After stage 1 |
| 4 | Security features in the app | After stage 3, or between slices |
| 5 | Staging environment | Once slices 4 and 5 exist, so UAT has real flows |
| 6 | Production infrastructure and operations | After staging works |
| 7 | Testing, audits and the VAPT | After feature freeze, on staging |
| 8 | Compliance and paperwork | Start now, finish before stage 9 |
| 9 | Cutover | Last |

Stages 2 and 8 depend on other people and take the most calendar time, so start them now even though they are numbered later. The VAPT comes after feature freeze, on a staging server that matches production, because a change after the audit may need a retest.

## Stage 1: Merge the open work

- [ ] Review and merge the stacked pull requests in order: PR 1 (foundation) into `main`, then PRs 2, 3, 5 and 7, retargeting each to `main` once the one below it is merged. **Dev**
- [ ] CI green on `main`: text check, lint, typecheck, tests, dependency audit, Playwright and Docker builds. **Dev**
- [ ] From then on, every slice is one pull request into `main`. **Dev**

## Stage 2: Hospital decisions

Each one blocks a feature, and none can be guessed (`CLAUDE.md` section 2). Answers go into `docs/billing-rules.md`. All **Hospital**.

- [ ] Packages: contents, exclusions, length of stay, and how extras are billed. Needed for slice 3b.
- [ ] OPD token and IPD admission number formats. Needed for slices 4 and 5.
- [ ] Registration fee: whether there is one, and how much. Needed for slice 4.
- [ ] Room and nursing charges posted at midnight: what is charged for the admission day and the discharge day. Needed for slice 5.
- [ ] Minimum advance for each room category. Needed for slice 5.
- [ ] The title printed on bills under GST ("Bill", "Tax invoice" or "Bill of supply") and which services are exempt. Needed before the first real bill.
- [ ] Hospital logo, GSTIN and the details printed on bills and receipts.
- [ ] Recovery targets: how much data the hospital can afford to lose, and how long it can run on paper. These set the backup schedule.
- [ ] How long medical and financial records must be kept.
- [ ] Whether existing patients (UHIDs, open balances, deposits) move over from the current system.
- [ ] Confirmation that the database, files, backups and logs must all stay in India.

## Stage 3: Finish phase 1 features

Each slice comes with its migration, API, screens, tests, seed data and docs. Details are in `docs/feature-checklist.md`.

- [ ] Slice 3b: discounts, refunds, credit notes and voids, each approved by a second user. **Dev**
- [ ] Slice 4, OPD: tokens, doctor queue, consultation fee, orders that post charges, follow-up dates. **Dev**
- [ ] Slice 5, IPD and beds: admission with deposit, bed board, transfers, interim bills, room and nursing charges posted at midnight IST. The midnight job needs pg-boss, a new dependency to approve. **Dev**
- [ ] Slice 6, discharge and reports: fit for discharge, final bill, refund of excess deposit, billing clearance, discharge summary, day-end collection report, Tally export. **Dev**
- [ ] PDF bills and receipts (PDFKit), and emailed bills: a password-protected PDF, the Resend adapter behind `MessageSender`, the pg-boss outbox, message templates in a table, and the dev inbox for mock mode (`CLAUDE.md` section 14). **Dev**
- [ ] Hospital logo upload to R2 (PDF, JPG or PNG, 10 MB at most, type checked, private bucket, links that expire after 5 minutes), shown on printed bills and receipts. **Dev**
- [ ] The full Playwright journey: register, OPD visit with receipt, admit, transfer, final bill, discharge (`CLAUDE.md` section 18). **Dev**
- [ ] Can follow go-live if the hospital agrees in writing: custom roles screen, patient photo, printed UHID card, merging duplicate patients, Hindi screens. **Dev + Hospital**

## Stage 4: Security features in the app

From `CLAUDE.md` section 9.

- [x] Argon2id passwords, lockout after 5 failed attempts, server-side sessions with idle and maximum timeouts, CSRF tokens, rate limits, security headers, permission guards on every route, idempotency keys, an audit log protected by append-only triggers, field encryption for Aadhaar and ABHA, patient fields redacted from logs.
- [ ] Two-factor login (TOTP) for super admin, hospital admin and finance roles. Needs otplib, already named in `CLAUDE.md`. **Dev**
- [ ] Password reset (limited to 3 per hour), and a forced password change at first sign-in for accounts the admin creates. **Dev**
- [ ] Staff can see and end their own sessions. **Dev**
- [ ] Break-glass access: written reason, 1 hour expiry, audit event, hospital admin notified. **Dev**
- [ ] Alert when there are more than 20 failed logins in 10 minutes. **Dev**
- [ ] A separate database role for the API, with no UPDATE, DELETE or TRUNCATE on audit rows and no schema changes; migrations run as another role. Partly: triggers block changes today, but the API's database user owns the tables and could drop the triggers. **Dev**
- [ ] A tighter Content-Security-Policy for the web app, using nonces (scripts need `'unsafe-inline'` today). **Dev**
- [ ] Production start-up guard: the API refuses to start with a mock adapter, a missing Sentry DSN or a demo secret. Partly: start-up already checks that secrets exist and are long enough. **Dev**
- [ ] A safe way to apply permission matrix changes to a live hospital, as a migration or a start-up sync. Today only `pnpm db:seed` syncs roles, and the seed refuses to run in production. **Dev**
- [ ] Clean-up job for old idempotency keys (pg-boss). **Dev**
- [ ] Rate limits on exports and PDFs (10 per hour per user) once those routes exist. **Dev**
- [ ] Rate limit counts live in memory, which is right for one API container. If production runs more than one, move them to PostgreSQL. **Dev**

## Stage 5: Staging environment

A copy of production with fake data, used for UAT, printer checks and the VAPT.

- [x] A production Docker Compose file and a Caddyfile (`app.` and `api.` subdomains): `deploy/compose.prod.yml` and `deploy/Caddyfile`, rehearsed in CI (`.github/workflows/deploy-rehearsal.yml`). **Dev**
- [ ] Oracle Cloud VM with Docker, the two images, Caddy, and Cloudflare in front. Partly: the web and API images build in CI and run as the non-root `node` user with health checks, and the setup steps are in `docs/runbooks/` (server hardening, Cloudflare, deploy). **Dev**
- [ ] Its own Supabase project and R2 bucket, sharing nothing with production. **Dev**
- [x] A deploy script the developer runs: build images from a tagged commit, run `pnpm db:deploy`, start the containers, check `/health`, and keep the previous images for rollback. `deploy/deploy.sh`, `deploy/rollback.sh` and `deploy/restart.sh`, rehearsed in CI; first real run on staging still to come. **Dev**
- [ ] Load the fake demo hospital, then rehearse entering the hospital's real masters (tariffs, staff names, wards). No real patients on staging. **Dev + Hospital**

## Stage 6: Production infrastructure and operations

- [ ] Paid host chosen, with its data centre in India. **Dev + Hospital**
- [ ] Server: SSH by key only, a firewall with only ports 80 and 443 open (Caddy), automatic security updates, and the clock synced by NTP. CERT-In asks for NIC or NPL time servers: confirm with the auditor. Partly: steps and files ready in `docs/runbooks/server-hardening.md` and `deploy/server/`, not yet applied to a server. **Dev**
- [ ] Supabase: **Dev**. Partly: `docs/runbooks/supabase.md`, `deploy/sql/supabase-lockdown.sql` and `deploy/check-database.sh` are ready; no project created yet.
  - the Mumbai region
  - the database reachable only from the server's IP address
  - its Data API turned off, or the `anon` and `authenticated` roles' access revoked. The app uses Supabase only as plain PostgreSQL, and tables in the `public` schema are otherwise reachable through Supabase's REST API.
  - a check that the connection pooler keeps the app's per-connection UTC setting and its row locks, or else a session pooler or a direct connection
- [ ] Cloudflare: DNS, proxy on, TLS set to full (strict), HSTS. Partly: steps in `docs/runbooks/cloudflare.md`, with authenticated origin pulls; not yet applied. **Dev**
- [ ] Production secrets: generate `SESSION_SECRET` and `FIELD_ENCRYPTION_KEY` once, keep them in the server's environment and in a second safe place, and write down how to rotate them. Losing the field key loses every Aadhaar and ABHA number. Partly: `docs/runbooks/secrets-and-rotation.md`; rotating the field key needs an app feature. **Dev**
- [ ] Production environment: `NODE_ENV=production`, `COOKIE_DOMAIN`, `CORS_ORIGINS`, `TRUST_PROXY` set for Cloudflare and Caddy, real email keys, and `MAIL_ENABLED` only once tested. Partly: templates in `deploy/env/` (`TRUST_PROXY=2`). **Dev**
- [ ] Backups: Supabase's daily backups, plus an encrypted `pg_dump` to an R2 bucket in a separate account, kept as long as the hospital decides in stage 2. **Dev**
- [ ] Restore drill: restore last night's backup to a fresh database, run the app on it, and check the bill and receipt counters and the audit trail. Repeat every quarter and record the result. **Dev**
- [ ] Monitoring: Sentry for web and API with patient data removed before anything is sent, an uptime check on `/health`, and alerts for downtime, error spikes, failed logins and failed backups. **Dev**
- [ ] Logs: API and Caddy logs shipped to storage in India and kept 180 days (CERT-In), out of reach of the app. **Dev**
- [x] Release process: tagged releases from `main`, a change log, migrations applied by the developer before new containers start, and written rollback steps. `CHANGELOG.md` and `docs/runbooks/deploy-and-rollback.md`. **Dev**
- [ ] Published backup, recovery and security practices, one of the four promises in `CLAUDE.md` section 1. **Dev**

## Stage 7: Testing, audits and the VAPT

- [ ] Performance budget on staging: first load under 1 MB of JavaScript, and first paint under 1.5 s on 4 Mbps. Measuring bundles needs `@next/bundle-analyzer`, a new dependency to approve. **Dev**
- [ ] Accessibility: a WCAG 2.1 AA check of every screen, with the billing and payment counters fully usable from the keyboard. **Dev**
- [ ] Load test (k6) of the billing counter at peak: post charges, issue bills and take payments at once, then check the number series has no gaps. **Dev**
- [ ] OWASP ZAP baseline scan against staging, run in CI. **Dev**
- [ ] Contract test: an OpenAPI snapshot, so the web app and the API cannot drift apart. **Dev**
- [ ] Printers: A4 and 80 mm printouts on the hospital's own printers and browsers. **Hospital + Dev**
- [ ] UAT: hospital staff run a normal day on staging (registration, OPD, admission, billing, cash shifts, discharge) and sign it off. **Hospital**
- [ ] VAPT on staging by a CERT-In empanelled auditor. Fix every high and critical finding, get a retest, and keep the report. **Auditor + Dev**

## Stage 8: Compliance and paperwork

Start now: these need the hospital and its adviser.

- [ ] Digital Personal Data Protection Act 2023 and its rules: a privacy notice for patients, consent wording at registration, how patients ask to see or correct their data, and duties when there is a breach. **Legal + Hospital**
- [ ] A data processing agreement between DevMSR and the hospital: who controls the data, who processes it, and what happens to it when the contract ends. **Legal**
- [ ] Incident response plan: who does what, and reporting cyber incidents to CERT-In within 6 hours. **Dev + Hospital**
- [ ] Access policy: who gets which role, same-day removal of staff who leave, and a monthly review of the user list. **Hospital**
- [ ] Downtime procedure: paper registration slips, bills and receipts for when the internet or the server is down, and how they are entered afterwards without breaking the number series. **Hospital + Dev**

## Stage 9: Cutover

- [ ] Enter the real masters in production: hospital profile and logo, departments, doctors, room categories, wards and beds, service items and rates. Entered by the hospital admin and accountant, checked by a second person. **Hospital**
- [ ] Create real staff accounts, with two-factor where required. Production has no demo users: the seed refuses to run there. **Hospital + Dev**
- [ ] Import existing patients only if the hospital decided to, through a tested import, never by editing the database by hand. **Dev**
- [ ] Train each role on staging: reception, billing, cashiers, nurses, doctors, accountant and admin. **Hospital + Dev**
- [ ] Go or no-go meeting: every item above ticked or deferred in writing, the VAPT closed, the restore drill passed and UAT signed. **Hospital + Dev**
- [ ] Parallel run: use the new system alongside the current one for an agreed period, comparing daily collections and bills. **Hospital**
- [ ] Go-live day: the developer on call, the overnight backup checked, and end-of-day shift tallies compared with the cash counted. **Dev + Hospital**
- [ ] First month: a weekly review of errors, slow screens, audit alerts and staff feedback. Fixes ship as normal pull requests. **Dev + Hospital**

## Ready for go-live when

- every item in stages 1 to 9 is ticked, or moved to after go-live in writing by the developer and the hospital;
- no high or critical VAPT finding is open;
- a backup has been restored and checked within the last 30 days;
- the MD and the accountant have signed off UAT.
