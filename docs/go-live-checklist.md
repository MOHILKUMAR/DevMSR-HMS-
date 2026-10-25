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

The questions to send are in [`docs/hospital-questions.md`](hospital-questions.md), grouped by who answers, with the question number after each item below. Its section D also asks the hospital to confirm the rules the developer has recorded so far.

- [ ] Packages: contents, exclusions, length of stay, and how extras are billed. Needed for slice 3b. Questions MD-1 and AC-6.
- [ ] OPD token and IPD admission number formats. Needed for slices 4 and 5. Questions AD-1 and AC-5.
- [ ] Registration fee: whether there is one, and how much. Needed for slice 4. Question MD-2.
- [ ] Room and nursing charges posted at midnight: what is charged for the admission day and the discharge day. Needed for slice 5. Question AC-3.
- [ ] Minimum advance for each room category. Needed for slice 5. Question AC-4.
- [ ] The title printed on bills under GST ("Bill", "Tax invoice" or "Bill of supply") and which services are exempt. Needed before the first real bill. Question AC-1.
- [ ] Hospital logo, GSTIN and the details printed on bills and receipts. Question AC-2.
- [ ] Recovery targets: how much data the hospital can afford to lose, and how long it can run on paper. These set the backup schedule. Questions MD-3 and MD-4.
- [ ] How long medical and financial records must be kept. Question MD-5.
- [ ] Whether existing patients (UHIDs, open balances, deposits) move over from the current system. Question MD-6.
- [ ] Confirmation that the database, files, backups and logs must all stay in India. Question MD-7.

## Stage 3: Finish phase 1 features

Each slice comes with its migration, API, screens, tests, seed data and docs. Details are in `docs/feature-checklist.md`.

- [x] Slice 3b: discounts, refunds, credit notes and voids, each approved by a second user. **Dev**
- [x] Slice 4, OPD: tokens, doctor queue, consultation fee, orders that post charges, follow-up dates. **Dev**
- [x] Slice 5, IPD and beds: admission with deposit, bed board, transfers, interim bills, room and nursing charges posted at midnight IST by a pg-boss job. **Dev**
- [x] Slice 6, discharge and reports: fit for discharge, final bill, refund of excess deposit, billing clearance, discharge summary, day-end collection report, Tally export. **Dev**
- [ ] PDF bills and receipts (PDFKit), and emailed bills: a password-protected PDF, the Resend adapter behind `MessageSender`, the pg-boss outbox, message templates in a table, and the dev inbox for mock mode (`CLAUDE.md` section 14). **Dev**
- [ ] Hospital logo upload to R2 (PDF, JPG or PNG, 10 MB at most, type checked, private bucket, links that expire after 5 minutes), shown on printed bills and receipts. **Dev**
- [ ] The full Playwright journey: register, OPD visit with receipt, admit, transfer, final bill, discharge (`CLAUDE.md` section 18). **Dev**
- [ ] Can follow go-live if the hospital agrees in writing: custom roles screen, patient photo, printed UHID card, merging duplicate patients, Hindi screens. **Dev + Hospital**

## Stage 4: Security features in the app

From `CLAUDE.md` section 9.

- [x] Argon2id passwords, lockout after 5 failed attempts, server-side sessions with idle and maximum timeouts, CSRF tokens, rate limits, security headers, permission guards on every route, idempotency keys, an audit log protected by append-only triggers, field encryption for Aadhaar and ABHA, patient fields redacted from logs.
- [x] Two-factor login (TOTP) for super admin, hospital admin and finance roles, decided by permission code, with recovery codes and an admin reset for lost phones. **Dev**
- [x] Password reset (limited to 3 per hour), and a forced password change at first sign-in for accounts the admin creates. Reset is admin-issued: the admin sets a temporary password, the user must choose their own at the next sign-in. Self-service reset by email or SMS waits for staff contact details and the outbox. **Dev**
- [x] Staff can see and end their own sessions (My account), and change their own password. **Dev**
- [x] Break-glass access: written reason, 1 hour expiry, audit event, hospital admin notified (in the app; email waits for the outbox). Read only. **Dev**
- [x] Alert when there are more than 20 failed logins in 10 minutes: an error log line with `alert: "auth.failed-logins"`, an audit event and notifications, per hospital and for the platform. Routing the log line to a person (Sentry or log monitoring) is part of stage 6. **Dev**
- [x] A separate database role for the API, with no UPDATE, DELETE or TRUNCATE on audit rows and no schema changes; migrations run as another role. The API logs in as a member of `hms_api` (`pnpm db:api-user`) and refuses to start in production as anything stronger. Background jobs log in separately (`JOBS_DATABASE_URL`, owner of the `pgboss` schema only), also made by `pnpm db:api-user`; production refuses to start without it. **Dev**
- [x] A tighter Content-Security-Policy for the web app, using nonces. **Dev**
- [x] Production start-up guard: the API refuses to start with a mock adapter, a missing Sentry DSN or a demo secret (`APP_ENV=production`). **Dev**
- [x] A safe way to apply permission matrix changes to a live hospital: `pnpm db:sync-roles --apply` in every deploy, and production refuses to start while roles differ from the matrix. **Dev**
- [ ] Clean-up job for old idempotency keys (pg-boss). **Dev**
- [x] Rate limits on exports and PDFs (10 per hour per user): the day book export has it (`@ExportRateLimit()`); PDFs take the same decorator when they arrive. **Dev**
- [ ] Rate limit counts live in memory, which is right for one API container. If production runs more than one, move them to PostgreSQL. **Dev**

## Stage 5: Staging environment

A copy of production with fake data, used for UAT, printer checks and the VAPT.

- [x] A production Docker Compose file and a Caddyfile (`app.` and `api.` subdomains): `deploy/compose.prod.yml` and `deploy/Caddyfile`, rehearsed in CI (`.github/workflows/deploy-rehearsal.yml`). **Dev**
- [ ] Oracle Cloud VM with Docker, the two images, Caddy, and Cloudflare in front, on a separate staging domain. Partly: the images build and deploy in CI, and [`docs/runbooks/staging-oracle-cloud.md`](runbooks/staging-oracle-cloud.md) walks through the server, domain and accounts step by step. The first real run is the developer's. **Dev**
- [ ] Its own Supabase project and R2 bucket, sharing nothing with production. **Dev**
- [x] A deploy script the developer runs: build images from a tagged commit, run `pnpm db:deploy`, start the containers, check `/health`, and keep the previous images for rollback. `deploy/deploy.sh`, `deploy/rollback.sh` and `deploy/restart.sh`, rehearsed in CI; first real run on staging still to come. **Dev**
- [ ] Load the fake demo hospital, then rehearse entering the hospital's real masters (tariffs, staff names, wards). No real patients on staging. Partly: `deploy/seed-staging.sh` loads it on the server (staging only, rehearsed in CI). **Dev + Hospital**

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
- [ ] Backups: Supabase's daily backups, plus an encrypted `pg_dump` to an R2 bucket in a separate account, kept as long as the hospital decides in stage 2. Partly: `deploy/backup.sh`, the `hms-backup` image and a nightly timer are ready and rehearsed in CI (`docs/runbooks/backup-and-restore.md`); no bucket or keys yet, and R2 cannot promise the data stays in India (stage 2). **Dev**
- [ ] Restore drill: restore last night's backup to a fresh database, run the app on it, and check the bill and receipt counters and the audit trail. Repeat every quarter and record the result. Partly: `deploy/restore-drill.sh` does all of this and also checks the field key; it runs in CI on every deploy change. The first drill on a real server and its entry in `docs/runbooks/restore-drill-log.md` are still to come. **Dev**
- [ ] Monitoring: Sentry for web and API with patient data removed before anything is sent, an uptime check on `/health`, and alerts for downtime, error spikes, failed logins and failed backups. Partly: `docs/runbooks/monitoring.md`, with backup and host heartbeats (`deploy/check-host.sh`); the uptime service is not chosen, and the Sentry SDKs and the failed-login alert are app work. **Dev**
- [ ] Logs: API and Caddy logs shipped to storage in India and kept 180 days (CERT-In), out of reach of the app. Partly: journald keeps 190 days on the server and `deploy/logs-export.sh` copies each day encrypted off the server (`docs/runbooks/log-retention.md`); not yet applied to a server, and the store's region is open. **Dev**
- [x] Release process: tagged releases from `main`, a change log, migrations applied by the developer before new containers start, and written rollback steps. `CHANGELOG.md` and `docs/runbooks/deploy-and-rollback.md`. **Dev**
- [ ] Published backup, recovery and security practices, one of the four promises in `CLAUDE.md` section 1. Partly: `docs/security-practices.md`, written for the hospital; publish it as a page once its "before go-live" items are true. **Dev**

## Stage 7: Testing, audits and the VAPT

- [ ] Performance budget on staging: first load under 1 MB of JavaScript, and first paint under 1.5 s on 4 Mbps. Partly: `apps/web/e2e/performance-budget.spec.ts` checks both in CI against the production build (compressed JavaScript, emulated 4 Mbps); still to be measured on staging. `@next/bundle-analyzer` was not needed. **Dev**
- [ ] Accessibility: a WCAG 2.1 AA check of every screen, with the billing and payment counters fully usable from the keyboard. Partly: `apps/web/e2e/accessibility.spec.ts` runs axe on every current screen and works both counters from the keyboard in CI; new screens join its list, and a screen reader check belongs in UAT. **Dev**
- [ ] Load test (k6) of the billing counter at peak: post charges, issue bills and take payments at once, then check the number series has no gaps. Partly: `tests/load/billing-counter.js` and the gap check run in CI (`.github/workflows/load-test.yml`); the peak run on staging is still to come (`docs/runbooks/load-test.md`). **Dev**
- [ ] OWASP ZAP baseline scan against staging, run in CI. Partly: `.github/workflows/zap-baseline.yml` is a manual dispatch for staging URLs and scans the runner's build on pull requests that change it (`docs/runbooks/zap-scan.md`); no staging yet. **Dev**
- [x] Contract test: an OpenAPI snapshot, so the web app and the API cannot drift apart. The API test checks `docs/openapi.json` against the routes, and CI checks the web's generated types against `docs/openapi.json`. **Dev**
- [ ] Printers: A4 and 80 mm printouts on the hospital's own printers and browsers. **Hospital + Dev**
- [ ] UAT: hospital staff run a normal day on staging (registration, OPD, admission, billing, cash shifts, discharge) and sign it off. **Hospital**
- [ ] VAPT on staging by a CERT-In empanelled auditor. Fix every high and critical finding, get a retest, and keep the report. **Auditor + Dev**

## Stage 8: Compliance and paperwork

Start now: these need the hospital and its adviser. Each item has a draft for review in `docs/drafts/`. An item is ticked only once the hospital, and where marked its legal adviser, has approved the final version.

- [ ] Digital Personal Data Protection Act 2023 and its rules: a privacy notice for patients, consent wording at registration, how patients ask to see or correct their data, and duties when there is a breach. **Legal + Hospital** Draft: [`docs/drafts/privacy-notice-and-consent.md`](drafts/privacy-notice-and-consent.md).
- [ ] A data processing agreement between DevMSR and the hospital: who controls the data, who processes it, and what happens to it when the contract ends. **Legal** Draft outline: [`docs/drafts/data-processing-agreement-outline.md`](drafts/data-processing-agreement-outline.md).
- [ ] Incident response plan: who does what, and reporting cyber incidents to CERT-In within 6 hours. **Dev + Hospital** Draft: [`docs/drafts/incident-response-plan.md`](drafts/incident-response-plan.md).
- [ ] Access policy: who gets which role, same-day removal of staff who leave, and a monthly review of the user list. **Hospital** Draft: [`docs/drafts/access-policy.md`](drafts/access-policy.md).
- [ ] Downtime procedure: paper registration slips, bills and receipts for when the internet or the server is down, and how they are entered afterwards without breaking the number series. **Hospital + Dev** Draft: [`docs/drafts/downtime-procedure.md`](drafts/downtime-procedure.md).

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
