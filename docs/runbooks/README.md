# Runbooks

Steps the developer follows on servers and accounts. Claude Code writes and tests the scripts; it never runs them against a real server.

| Runbook | Covers |
| --- | --- |
| [staging-render.md](staging-render.md) | Staging on Render's free plan: the domain, Supabase, the Render Blueprint, GitHub's staging secrets, the Deploy staging workflow, the demo hospital |
| [staging-oracle-cloud.md](staging-oracle-cloud.md) | Staging from nothing: the separate domain, the Oracle Cloud server, Supabase and Cloudflare for staging, the first release and the demo hospital |
| [server-hardening.md](server-hardening.md) | SSH by key only, firewalls, NTP, automatic updates, Docker settings |
| [cloudflare.md](cloudflare.md) | DNS, TLS, origin certificate, authenticated origin pulls, real client IPs |
| [supabase.md](supabase.md) | Mumbai region, Data API off, network restrictions, which connection string, the connection check |
| [secrets-and-rotation.md](secrets-and-rotation.md) | Where secrets live, the second safe place, rotating each one |
| [deploy-and-rollback.md](deploy-and-rollback.md) | Server layout, first-time setup, releases, migrations, rollback |
| [backup-and-restore.md](backup-and-restore.md) | Encrypted backups, the restore drill, real recovery |
| [restore-drill-log.md](restore-drill-log.md) | The record of every drill |
| [monitoring.md](monitoring.md) | Uptime checks, heartbeats, Sentry rules, where to look |
| [log-retention.md](log-retention.md) | 180-day logs in India, the daily encrypted copy |
| [load-test.md](load-test.md) | k6 billing counter load test and the number series check |
| [zap-scan.md](zap-scan.md) | OWASP ZAP baseline scan against staging |

Order for a new server: hardening, Cloudflare, Supabase, secrets, the first deploy, then backups, monitoring and log retention. For staging, [staging-render.md](staging-render.md) (Render's free plan) or [staging-oracle-cloud.md](staging-oracle-cloud.md) (a server of our own) walks through all of it in order.

The summary for the hospital is [../security-practices.md](../security-practices.md).
