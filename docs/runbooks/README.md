# Runbooks

Steps the developer follows on servers and accounts. Claude Code writes and tests the scripts; it never runs them against a real server.

| Runbook | Covers |
| --- | --- |
| [server-hardening.md](server-hardening.md) | SSH by key only, firewalls, NTP, automatic updates, Docker settings |
| [cloudflare.md](cloudflare.md) | DNS, TLS, origin certificate, authenticated origin pulls, real client IPs |
| [supabase.md](supabase.md) | Mumbai region, Data API off, network restrictions, which connection string, the connection check |
| [secrets-and-rotation.md](secrets-and-rotation.md) | Where secrets live, the second safe place, rotating each one |
| [deploy-and-rollback.md](deploy-and-rollback.md) | Server layout, first-time setup, releases, migrations, rollback |

Order for a new server: hardening, Cloudflare, Supabase, secrets, then the first deploy.
