# Supabase

The app uses Supabase only as plain PostgreSQL through Prisma (`CLAUDE.md` section 3): no Supabase Auth, Storage, REST or GraphQL. Staging and production are separate projects that share nothing. Files: `deploy/sql/supabase-lockdown.sql`, `deploy/check-database.sh`.

## 1. Create the project

- Region: **South Asia (Mumbai)**, `ap-south-1`. The region cannot be changed later.
- PostgreSQL major version: check it matches local development and CI (17, `docs/decisions.md`). If Supabase offers only a newer one, align local and CI in a pull request first.
- A strong database password, generated, kept as in [secrets-and-rotation.md](secrets-and-rotation.md).
- Plan: a paid plan for production, for daily backups with point-in-time recovery as an option, and no pausing.

## 2. Close everything the app does not use

1. **Data API off.** Project settings, API (or Data API): turn the Data API off. If the dashboard only allows removing schemas, remove `public` (and `graphql_public`) from the exposed schemas.
2. **Revoke the API roles anyway.** After the first migration, run `deploy/sql/supabase-lockdown.sql` in the SQL editor. It revokes `anon` and `authenticated` from every table, sequence and function in `public`, including ones created later, and ends with two checks that must return no rows. Run it again after any migration that adds a schema. CI runs it against stand-in roles on every deploy rehearsal.
3. **Auth and Storage unused.** Leave Auth with no providers enabled and do not create Storage buckets. Files go to R2.

## 3. Network restrictions

Database settings, Network restrictions: allow only the server's public IPv4 address (`/32`), plus the developer's address while doing a migration or a restore from a laptop, removed afterwards. Check from another network that `psql` cannot connect. Confirm in the dashboard that the restriction covers the connection pooler as well as direct connections.

Also turn on **Enforce SSL** for connections.

## 4. Which connection string

Supabase offers three:

| Connection | Address | Keeps session settings | Notes |
| --- | --- | --- | --- |
| Direct | `db.<ref>.supabase.co:5432` | Yes | IPv6 only unless the IPv4 add-on is bought. Docker containers have no IPv6 by default |
| Session pooler | `<pooler-host>:5432` | Yes | IPv4. One server connection per client connection |
| Transaction pooler | `<pooler-host>:6543` | No | IPv4. Each transaction may use a different server connection |

Use the **session pooler** for both `DATABASE_URL` (API) and `DIRECT_URL` (migrations), unless the direct connection is reachable. Why:

- The API opens every connection with the startup option `-c TimeZone=UTC` (`docs/decisions.md`, "Database sessions run in UTC"). A transaction pooler may drop it or apply it only to the first server connection, and timestamps would then be stored 5.5 hours wrong on any server connection in IST. Supabase databases default to UTC, which hides the problem until someone changes it.
- The gapless counters hold row locks from the counter update to the commit. That works through any pooler that keeps a transaction on one server connection, but the session pooler makes it certain.
- Prisma migrations take advisory locks for the whole session, which a transaction pooler breaks.

Keep the API's pool small (node-postgres opens up to 10 connections) and within the plan's session pooler limit.

## 5. Prove it: `deploy/check-database.sh`

On the server, with the real `api.env` in place:

```bash
deploy/check-database.sh                 # reads DATABASE_URL from /opt/hms/env/api.env
deploy/check-database.sh --row-lock      # also locks a real counter row for 4 seconds: staging, or before go-live
```

It checks, through the same connection string and startup option the API uses:

1. five separate transactions all run in UTC, and how many server connections they used (more than one means a transaction pooler);
2. one transaction stays on one server connection from BEGIN to COMMIT;
3. a lock taken in one transaction blocks a second connection until COMMIT, and is free afterwards.

Every line must say PASS. Keep the output with the go-live records. Run it again whenever the connection string, the pooler mode or the plan changes.

## 6. TLS

Connection strings use `sslmode=require`. node-postgres may then insist on verifying the server certificate against the system's CAs and refuse Supabase's own CA. If the API fails to start with a certificate error:

1. download the project's CA certificate from the dashboard (Database settings, SSL configuration);
2. put it at `/opt/hms/db-certs/supabase-ca.crt` (the compose file mounts that folder read-only into the API);
3. add `NODE_EXTRA_CA_CERTS=/etc/hms/db-certs/supabase-ca.crt` to `api.env` and deploy again.

Never work around it with `sslmode=no-verify` or `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## 7. Backups on the Supabase side

Supabase's daily backups are the first layer. The encrypted `pg_dump` to a separate account is the second, and the restore drill proves both ([backup-and-restore.md](backup-and-restore.md)).

## Checklist

- [ ] Mumbai region, separate projects for staging and production
- [ ] Data API off, `supabase-lockdown.sql` run, both checks empty
- [ ] Network restrictions: server IP only; SSL enforced
- [ ] Session pooler (or direct) in `DATABASE_URL` and `DIRECT_URL`
- [ ] `deploy/check-database.sh` all PASS on staging and on production
- [ ] API starts and connects with TLS verified
