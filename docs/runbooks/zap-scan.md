# OWASP ZAP baseline scan

A passive scan for missing security headers and common web flaws (`CLAUDE.md` section 18). It is not the VAPT: the CERT-In empanelled auditor's test comes after it. Files: `.github/workflows/zap-baseline.yml`, `.zap/rules.tsv`.

## Running it

- **Against staging:** Actions, "OWASP ZAP baseline", Run workflow, with the staging web URL (for example `https://app.staging.example.in`) and the API health URL (`https://api.staging.example.in/api/v1/health`). The workflow runs only from `main`, so this works once it is merged.
- **On pull requests** that change the scan itself, it builds the app and scans it on the runner over plain HTTP, so HSTS is not checked there.
- Once staging is up, add a weekly `schedule` to the workflow with the staging URLs.

ZAP sends ordinary requests, spidering for up to 3 minutes. Run it against staging only, never production without the hospital's agreement, and tell the developer watching Cloudflare first.

## Reading the result

The HTML and JSON reports are kept as the run's `zap-reports` artifact for 30 days. In `.zap/rules.tsv`:

- **FAIL** rules (headers and cookie flags `CLAUDE.md` section 9 requires, version leaks, error disclosure) fail the job.
- **WARN** rules are reported only. Each accepted one has its reason in the file: `script-src 'unsafe-inline'` until nonces land (stage 4), cookies shared by the `app.` and `api.` hosts on purpose, and no Permissions-Policy on the JSON-only API.

Fix a new finding in a pull request, or, if it is accepted, add it as WARN with its reason in the same pull request. Keep the staging reports with the VAPT papers.
