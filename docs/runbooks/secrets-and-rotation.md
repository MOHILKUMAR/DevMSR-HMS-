# Production secrets and rotation

Secrets live only in environment files on the server (`/opt/hms/env/*.env`, mode 600) and in one second safe place. They are never committed, printed, logged, pasted into chat or sent by email (`CLAUDE.md` section 7). Staging and production never share a secret.

## The second safe place

A password manager vault that only the developer and one named person at the hospital (the MD or someone they name in writing) can open, with two-factor login. Each production secret is stored there as its own item with the date it was set. Without this copy, a lost server means lost Aadhaar and ABHA numbers and unreadable backups.

## Generating

```bash
openssl rand -base64 32
```

Run it on the server or the developer's own machine, paste the output straight into the env file and the vault, and clear the terminal. Never generate secrets in a website.

## Inventory

| Secret | Where | If it leaks | Rotation |
| --- | --- | --- | --- |
| `SESSION_SECRET` | `api.env` | Forged CSRF tokens (sessions themselves are random tokens in the database) | Easy, below. Yearly, and on any suspicion |
| `FIELD_ENCRYPTION_KEY` | `api.env` | Aadhaar and ABHA numbers readable by whoever also has the database | Needs an app feature, below. Never lose it |
| Owner database password (`DIRECT_URL`) | `migrate.env` | Full database access from an allowed IP | Supabase dashboard, below. Yearly |
| API database login password (`DATABASE_URL`) | `api.env` | Read and write app rows, never audit changes or schema | Change it in `api.env` and deploy: `deploy.sh` resets the login's password. Yearly |
| R2 keys (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) | `api.env` | Files (logos, attachments) readable or deletable | New token, deploy, delete old. Yearly |
| Backup bucket keys | backup env (backup runbook) | Backups deletable (they stay encrypted) | Same as R2 |
| Backup age private key | Offline only: the vault and a printed copy in the hospital's safe | Backups readable | New key pair; old backups stay readable only with the old key, so keep it until they expire |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | `api.env` | Email sent as the hospital; forged delivery events | New key in Resend, deploy, delete old |
| Payment, WhatsApp and SMS keys (later) | `api.env` | Money or messages in the hospital's name | Per provider, when added |
| Cloudflare origin key | `certs/origin.key` | Impersonating the origin to Cloudflare (needs the network path too) | New origin certificate, swap files, `deploy/restart.sh caddy` |
| Sentry DSN | `api.env`, `deploy.env` | Junk events (it is public in the browser by design) | Not secret |
| SSH private key | Developer's machine only, with a passphrase | Server access | New key, update `authorized_keys`, remove old |
| Cloudflare, Supabase, R2, GitHub, Resend account logins | Vault, with two-factor on every one | Everything | Change on any suspicion and when anyone with access leaves |

## Rotating `SESSION_SECRET`

1. Generate a new value, put it in `api.env` and the vault.
2. Restart the API: `deploy/restart.sh api`.
3. Effect: CSRF tokens issued before the change stop working. Screens fetch a fresh one on reload, so staff may need to reload once. Do it outside counter rush hours.

## Rotating `FIELD_ENCRYPTION_KEY`

The stored format starts with a version (`v1:iv:ciphertext:tag`, `docs/decisions.md`), so rotation is possible but not built yet. It needs an app feature: the API reads a previous key alongside the current one, a background job re-encrypts every `v1` value and rebuilds the blind indexes with the new key, and the old key is removed only after the job finishes and a backup made after it has been restored and checked. Until then:

- never change this key on a database that holds real numbers;
- if it is suspected to be exposed, treat it as a security incident (incident response plan), and build the rotation feature as the fix.

Losing this key loses every Aadhaar and ABHA number for good. Restoring a backup needs the key that was in use when the backup was taken.

## Rotating the database passwords

The owner (`DIRECT_URL`, used by migrations) and the API's own login (`DATABASE_URL`) have separate passwords.

Owner:

1. Supabase dashboard: Database settings, reset the database password.
2. Update `DIRECT_URL` in `migrate.env` and the vault. The running API does not use it, so nothing restarts.

API login:

1. Generate a new password (`openssl rand -hex 24`) and put it in `DATABASE_URL` in `api.env` and the vault.
2. Set it on the login and restart the API:

   ```bash
   tag=$(cat /opt/hms/state/current)
   docker run --rm --env-file /opt/hms/env/api.env --env-file /opt/hms/env/migrate.env hms-api:$tag node dist/cli/create-api-db-user.js
   deploy/restart.sh api
   deploy/check-database.sh
   ```

Existing connections keep working until they reconnect, so the switch has no outage beyond the restart.

## When someone leaves

The same day: remove their access to every account in the inventory, rotate any secret they could have read, and record what was done in the access log (go-live checklist stage 8).

## Yearly

Each April, with the new financial year: rotate `SESSION_SECRET`, the database password and the R2 and Resend keys, and check every account in the inventory still has two-factor on. Record the date in the vault.
