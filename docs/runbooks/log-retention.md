# Log retention

CERT-In's April 2022 directions ask service providers to keep logs of their ICT systems for 180 days within India and hand them over on request. `CLAUDE.md` section 9 says the same. Files: `deploy/server/journald-hms.conf`, `deploy/server/docker-daemon.json`, `deploy/logs-export.sh`, `deploy/systemd/hms-logs-export.*`.

## What is kept

| Log | Source | Holds |
| --- | --- | --- |
| API | `hms-api-1` container, JSON (pino) | Every request except health checks: time, request ID, method, path without the query string, status, duration, client address. Never bodies, cookies or other headers; personal fields are redacted wherever they appear |
| Web | `hms-web-1` container | Next.js server errors |
| Proxy | `hms-caddy-1` container, JSON | Every request reaching the server: client IP (from Cloudflare), host, path with the query string removed, status, size, TLS details. Caddy redacts cookies and authorization headers; the Referer header is dropped |
| Host | journald | SSH logins and failures, sudo, Docker, kernel, firewall drops, unattended upgrades |
| App audit trail | `audit_events` table | Who did what to which record. Kept in the database for as long as records are kept, and in every backup |
| Logins | `login_events` table | Every successful and failed login |

URLs carry only UUIDs (`CLAUDE.md` section 7), so access logs hold no patient details.

## Where it is kept

1. **On the server, 190 days.** Docker sends every container's output to journald (`docker-daemon.json` and the compose file), and `journald-hms.conf` keeps all of it persistent, compressed and sealed for 190 days. The server is in India (Supabase Mumbai, an Indian data centre for the host), so this copy alone meets the 180 days.
2. **Off the server, daily.** `deploy/logs-export.sh` copies the previous UTC day of the whole journal, gzipped and encrypted to the backup keys, to `LOG_STORE`. It survives the loss of the server, and a lifecycle rule deletes copies after 200 days. Pick the store's region together with the backup bucket ([backup-and-restore.md](backup-and-restore.md)): for "within India" it must be an Indian region.

The app's containers cannot read the journal or the store's token: the token is only in `backup.env` on the host. Only the developer's account and root read logs on the server.

## Setup

```bash
sudo mkdir -p /etc/systemd/journald.conf.d
sudo cp deploy/server/journald-hms.conf /etc/systemd/journald.conf.d/hms.conf
sudo systemctl restart systemd-journald
sudo journalctl --setup-keys           # sealing: store the printed verification key in the vault
sudo usermod -aG systemd-journal hmsadmin
sudo cp deploy/systemd/hms-logs-export.* /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now hms-logs-export.timer
```

Log out and in again for the group change, then run `deploy/logs-export.sh` once by hand and check the file appears in the store.

## Checks

- `journalctl --disk-usage` stays below `SystemMaxUse` (20 GB): if it gets close before 190 days, raise it and the disk, never lower the retention.
- `journalctl --verify` with the sealing key shows the journal has not been altered.
- `journalctl --since "180 days ago" | head` shows entries that old once the server has been running that long.
- Weekly until a heartbeat is added: `systemctl status hms-logs-export`.

## Handing logs to CERT-In or the auditor

Export the period asked for, for example `journalctl --utc --since 2026-11-01 --until 2026-11-08 --output json > logs.json`, or decrypt the daily exports with a backup private key: `age --decrypt -i key journal-<host>-<day>.json.gz.age | gunzip`. Hand them over through the channel the request names, and record what was sent in the incident file.

## Clock

Every log is only as good as its timestamp. The server syncs to NIC and NPL time servers and runs in UTC ([server-hardening.md](server-hardening.md)); journald stores UTC and shows local time only when asked.
