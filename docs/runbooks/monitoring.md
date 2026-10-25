# Monitoring and alerts

What tells the developer something is wrong before the hospital phones. Files: `deploy/check-host.sh`, `deploy/systemd/`, and the heartbeat settings in `deploy/env/backup.env.example`.

## What is watched

| Signal | How | Alert when | Status |
| --- | --- | --- | --- |
| App down | External uptime check of `https://api.<domain>/api/v1/health` and `https://app.<domain>/login` every minute | 2 failures in a row | Ready to set up |
| Backup failed or missing | `deploy/backup.sh` pings `BACKUP_PING_URL` (or `BACKUP_PING_FAIL_URL`) | A fail ping, or no ping for 26 hours | Ready |
| Host trouble | `deploy/check-host.sh` every hour: disk above 80%, a container not running or unhealthy | A fail ping, or no ping for 2 hours | Ready |
| Log export failed | `hms-logs-export.service` exit status | Checked weekly with `systemctl status hms-logs-export` until a heartbeat is added | Ready |
| App errors | Sentry for the API and the web app, patient data removed before sending | A new error type, or more than 20 events in 10 minutes | App work, below |
| Failed logins | More than 20 failed logins in 10 minutes (`CLAUDE.md` section 9) | Immediately | App work: go-live checklist stage 4 |
| Restore drill | Calendar | Quarterly | Ready |

## Uptime service

Pick one free external service that supports both URL checks and heartbeats (also called cron or dead man's switch monitors), for example Better Stack, UptimeRobot or Healthchecks.io, or Cloudflare health checks on a paid plan. It must sit outside the server. Nothing has been signed up for: this is the developer's choice (`CLAUDE.md` section 2, rule 8).

1. Two URL monitors: the health URL and the login page, every minute, alerting by email and SMS or a phone app to the developer, plus the hospital admin for downtime.
2. Two heartbeats: "backup" (expected every 24 hours, 2 hours grace) and "host" (every hour, 1 hour grace). Put their success and failure URLs in `backup.env`.
3. Install the timers:

   ```bash
   sudo cp deploy/systemd/hms-check-host.* /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now hms-check-host.timer
   ```

4. Test each alert once: stop the API container for 3 minutes, and run `BACKUP_PING_URL= deploy/backup.sh` with a wrong database password. Record that the alerts arrived.

Health URLs are public by design and return only `{"status":"ok"}`. Uptime checks pass through Cloudflare like any visitor.

## Sentry (app work, not done yet)

`SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are already in the env templates, but the SDKs are not in the apps. Adding them is a feature slice for the app tracks and needs the developer's approval for `@sentry/nestjs` and `@sentry/nextjs`. Its rules:

- `sendDefaultPii: false`. No request bodies, cookies, headers or query strings are sent.
- A `beforeSend` (and `beforeBreadcrumb`) hook that drops request data, user names, and any string matching a phone, Aadhaar, ABHA or email pattern, and keeps only the route pattern (`/patients/:id`), the request ID and the error type. A unit test feeds it a fake patient record and checks nothing survives.
- Session replay and user feedback off.
- `environment` set to `staging` or `production`; staging and production in separate Sentry projects.
- Sentry stores data in the US or the EU, not India. With the scrubbing above only error types and stack traces leave; the hospital should know this (stage 8 privacy paperwork). A self-hosted alternative would keep it in India at the cost of running it.

## Where to look when an alert fires

1. `docker ps` and `deploy/check-host.sh`.
2. Logs: `journalctl -t hms-api-1 --since "15 min ago"` (and `hms-web-1`, `hms-caddy-1`). API logs are JSON with a request ID; patient fields are redacted.
3. `journalctl -u hms-backup --since today` for a failed backup.
4. Cloudflare's dashboard for traffic spikes or errors at the edge.
5. If the server itself is gone: [deploy-and-rollback.md](deploy-and-rollback.md) to rebuild, [backup-and-restore.md](backup-and-restore.md) if the database is affected.
