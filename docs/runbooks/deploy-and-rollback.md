# Deploy and rollback

How a release reaches the staging or production server, and how to go back. The developer runs every step; Claude Code never touches a server. Files: `deploy/`.

## Server layout

Everything lives under `/opt/hms` (`HMS_HOME`), owned by the `hmsadmin` user:

| Path | What | In git |
| --- | --- | --- |
| `src/` | Clone of the repository. The scripts run from here | Yes |
| `env/deploy.env` | Host names and web build arguments, no secrets | Template in `deploy/env/` |
| `env/api.env`, `env/web.env`, `env/migrate.env` | Runtime settings and secrets, mode 600 | Templates only |
| `certs/` | Cloudflare origin certificate and key, origin pull CA ([cloudflare.md](cloudflare.md)) | No |
| `db-certs/` | Supabase CA certificate, only if needed ([supabase.md](supabase.md)) | No |
| `releases/<tag>/` | The compose file, Caddyfile and Caddy snippets of each kept release | Copied from the tag |
| `state/` | `current`, `previous`, `history.log`, the deploy lock | No |

Images are named `hms-api:<tag>`, `hms-web:<tag>`, `hms-migrate:<tag>` and `hms-backup:<tag>` (`hms-seed:<tag>` exists only while `seed-staging.sh` runs). The newest 3 releases (`KEEP_RELEASES`) keep their images and folders, so rollback needs no rebuild.

## First-time setup

1. Harden the server first: [server-hardening.md](server-hardening.md).
2. Install Docker Engine and the Compose plugin from Docker's apt repository, and copy `deploy/server/docker-daemon.json` to `/etc/docker/daemon.json`, then `sudo systemctl restart docker`.
3. Create the folders and clone:

   ```bash
   sudo mkdir -p /opt/hms && sudo chown hmsadmin:hmsadmin /opt/hms
   git clone https://github.com/MOHILKUMAR/DevMSR-HMS-.git /opt/hms/src
   mkdir -p /opt/hms/env /opt/hms/certs /opt/hms/state && chmod 700 /opt/hms/env /opt/hms/certs
   ```

   A private repository needs a read-only deploy key for this server, added in the repository settings.
4. Copy each `deploy/env/*.example` to `/opt/hms/env/` without `.example`, fill in the values ([secrets-and-rotation.md](secrets-and-rotation.md)), and `chmod 600 /opt/hms/env/*`.
5. Put the Cloudflare files in `/opt/hms/certs/` ([cloudflare.md](cloudflare.md)).
6. Run `deploy/check-database.sh` ([supabase.md](supabase.md)).
7. Deploy the first release (below). For staging, load the fake demo hospital afterwards with `deploy/seed-staging.sh` on the server: it builds the seed from the running release, asks for the demo password, and refuses unless the settings say staging. The full staging walk-through is [staging-oracle-cloud.md](staging-oracle-cloud.md).

## Making a release

1. Everything for the release is merged into `main` and CI is green.
2. Add the release to `CHANGELOG.md` in a pull request: what changed for hospital staff, and any migration that needs care.
3. Tag the merged commit and push the tag:

   ```bash
   git tag -a v1.4.0 -m "v1.4.0"
   git push origin v1.4.0
   ```

4. On the server:

   ```bash
   cd /opt/hms/src && git pull --ff-only
   deploy/deploy.sh v1.4.0
   ```

   Preview the commands first with `DRY_RUN=1 deploy/deploy.sh v1.4.0`.

`deploy.sh` then:

1. fetches the tag and refuses it unless it is on `origin/main`;
2. exports the tagged tree to a temporary folder (never a checkout, so local edits on the server never reach an image);
3. builds the four images (api, web, migrate, backup), passing the `NEXT_PUBLIC_` values from `deploy.env` as build arguments;
4. takes an encrypted backup ([backup-and-restore.md](backup-and-restore.md)) and stops if it fails, then applies migrations with the migrate image while the current release keeps serving, then creates the API's restricted database login from `DATABASE_URL` (or resets its password) and runs `sync-roles --apply` so the seeded roles match the new release's permission matrix (production refuses to start while they differ);
5. starts the new containers, waits for their health checks, then checks `https://api.../api/v1/health` and `https://app.../login` through Cloudflare;
6. if the new release is unhealthy, starts the previous one again and stops with an error;
7. records the tag in `state/` and removes images and folders older than the newest 3 releases.

Deploy outside counter rush hours. The switch takes a few seconds while containers restart.

## Migrations and rollback

A rollback starts older images; it never undoes a migration. So every migration must keep the previous release working:

- Add first, remove later. A new column is nullable or has a default. A column or table is dropped only in a later release, after no running code reads it.
- Never rename in one step: add the new column, copy, switch the code, then drop the old one in a later release.
- A migration that cannot follow these rules is written up in the pull request and in `CHANGELOG.md`, and that release is deployed with a fresh backup and the developer watching.

The CI rehearsal applies migrations and starts the containers on every pull request that touches `prisma/migrations`, `deploy/` or the Dockerfiles, so a migration that breaks the start-up shows there first.

## Rollback

```bash
deploy/rollback.sh            # back to the previous release
deploy/rollback.sh v1.3.2     # back to another kept release (see state/history.log)
```

It syncs the seeded roles back to that release's permission matrix, starts its kept images, checks health the same way, and records the change. If the release was pruned, deploy its tag again instead.

## Restarting after a settings change

After editing an env file or replacing a certificate: `deploy/restart.sh api` (or `web`, `caddy`, or nothing for all three). It recreates those containers of the current release and checks health.

### If the scripts themselves fail

1. See what is running: `docker ps` and `cat /opt/hms/state/current`.
2. Start a kept release by hand:

   ```bash
   cd /opt/hms/releases/v1.3.2
   HMS_TAG=v1.3.2 HMS_HOME=/opt/hms docker compose --project-name hms --env-file /opt/hms/env/deploy.env -f compose.prod.yml up -d --wait
   ```

3. Read the logs: `journalctl -t hms-api-1 --since "30 min ago"` (also `hms-web-1`, `hms-caddy-1`).
4. If the database itself is damaged, follow [backup-and-restore.md](backup-and-restore.md) and tell the hospital to switch to the paper downtime procedure.

## Rehearsal in CI

`.github/workflows/deploy-rehearsal.yml` treats the CI runner as a server: it builds a throwaway `HMS_HOME` with test certificates (`deploy/test/make-rehearsal-home.sh`), deploys two tags, rolls back, and checks the state, container hardening, security headers, the HTTP redirect, and that a client without the origin pull certificate is refused (`deploy/test/check-rehearsal.sh`). `deploy/test/dry-run.sh` checks the scripts without Docker and runs on a Windows developer machine in Git Bash too.
