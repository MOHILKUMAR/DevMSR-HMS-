# Runbooks

Steps the developer follows on servers and accounts. Claude Code writes and tests the scripts; it never runs them against a real server.

| Runbook | Covers |
| --- | --- |
| [server-hardening.md](server-hardening.md) | SSH by key only, firewalls, NTP, automatic updates, Docker settings |
| [cloudflare.md](cloudflare.md) | DNS, TLS, origin certificate, authenticated origin pulls, real client IPs |
| [supabase.md](supabase.md) | Mumbai region, Data API off, network restrictions, which connection string, the connection check |
| [secrets-and-rotation.md](secrets-and-rotation.md) | Where secrets live, the second safe place, rotating each one |
| [deploy-and-rollback.md](deploy-and-rollback.md) | Server layout, first-time setup, releases, migrations, rollback |
| [backup-and-restore.md](backup-and-restore.md) | Encrypted backups, the restore drill, real recovery |
| [restore-drill-log.md](restore-drill-log.md) | The record of every drill |
| [monitoring.md](monitoring.md) | Uptime checks, heartbeats, Sentry rules, where to look |
| [log-retention.md](log-retention.md) | 180-day logs in India, the daily encrypted copy |

Order for a new server: hardening, Cloudflare, Supabase, secrets, the first deploy, then backups, monitoring and log retention.

The summary for the hospital is [../security-practices.md](../security-practices.md).
