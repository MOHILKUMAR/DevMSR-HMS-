# Load test: the billing counter at peak

Go-live checklist stage 7. Proves the billing counter stays fast at the hospital's busiest hour and that the bill and receipt numbers stay gapless while many counters work at once. Files: `tests/load/billing-counter.js` (k6), `deploy/sql/check-number-series.sql`, `.github/workflows/load-test.yml`.

## What one virtual counter does

Each k6 virtual user is one counter, with its own billing clerk session and cashier session:

1. posts 1 to 3 charges for a seeded patient;
2. drafts a bill from them and issues it (one issue in ten is sent twice at the same moment with one `Idempotency-Key`, as a double click does);
3. the cashier takes the amount due in cash or UPI (one in ten sent twice the same way);
4. pauses about `THINK_SECONDS`, then starts the next bill.

It fails if more than 1% of requests fail, if fewer than 99% of checks pass, if the 95th percentile is above 800 ms for charges or 1 s for drafts, issues and payments, or if any double submit created two records. Afterwards `check-number-series.sql` must show every UHID, bill and receipt series starting at 1 with no gaps or repeats and matching its counter, and the database must hold exactly as many issued bills and receipts as k6 counted.

## In CI

The workflow runs on pull requests that change the load test, and by hand (Actions, "Load test (billing counter)", with the number of counters and the duration). It starts the production build of the API on the runner against a seeded throwaway database, runs k6 in the `grafana/k6` image, then the checks above. It proves the script and the numbering under concurrency; it is not the peak measurement, because the runner is not the server.

## On staging (the real run)

Before go-live, after feature freeze, on the staging server that matches production.

1. Agree the peak with the hospital: how many billing counters and cashiers work at once at the busiest hour, and how many bills an hour. Set `COUNTERS` to that number, and run at least twice that as a stress check.
2. Staging must hold only the fake demo hospital (`pnpm db:seed`), never real patients. The test adds bills and receipts to it.
3. The login limit is 5 per minute per user and address, and the script signs in once per counter for the clerk and once for the cashier, waiting out the limit. With many counters, either accept a few minutes of setup, or raise `RATE_LIMIT_LOGIN_PER_MINUTE` in staging's `api.env` for the run (`deploy/restart.sh api`) and set it back afterwards.
4. From the developer's machine or another server (not the staging server itself, so k6 does not steal its CPU):

   ```bash
   docker run --rm -v "$PWD/tests/load:/scripts:ro" grafana/k6:2.2.0 run \
     -e BASE_URL=https://api.staging.example.in -e PASSWORD='<staging demo password>' \
     -e COUNTERS=10 -e DURATION=10m -e THINK_SECONDS=5 /scripts/billing-counter.js
   ```

   Requests go through Cloudflare, like the counters' own. Tell the developer watching Cloudflare that a burst from one address is expected.
5. During the run, on the server: `docker stats` (CPU and memory of `hms-api-1`; raise `mem_limit` in the compose file if it nears 768 MB) and `uptime`.
6. Afterwards, on the server:

   ```bash
   psql "$DIRECT_URL" -X -v ON_ERROR_STOP=1 -f deploy/sql/check-number-series.sql
   ```

7. Record in the go-live checklist: counters, duration, bills per minute, p95 per step, errors, the number series result, and the server's peak CPU and memory.

## When it fails

- **Slow steps:** look at `docker stats`, the API log (`journalctl -t hms-api-1`), and Supabase's query performance page. Fix in a feature pull request, then run again.
- **Number series wrong:** stop. A gap or repeat under load is a correctness bug in the numbering (`docs/decisions.md`, "UHIDs come from a locked counter row"); it blocks go-live.
- **Double submit created twice:** the idempotency step is broken for that route; it blocks go-live.
