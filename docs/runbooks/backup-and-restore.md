# Backups and restore

Two layers, so one failure never loses the hospital's records:

1. **Supabase's own daily backups** (and point-in-time recovery if the plan has it), inside the Supabase project.
2. **Our encrypted `pg_dump`**, every night and before every migration, to a bucket in a **separate account** that the production server can write to but not delete from.

A backup that has never been restored is a hope, not a backup. The restore drill proves both layers every quarter. Files: `deploy/backup.sh`, `deploy/restore-drill.sh`, `deploy/backup/`, `deploy/sql/restore-checks.sql`, `deploy/sql/check-number-series.sql`, `deploy/systemd/hms-backup.*`.

## What a backup is

- `pg_dump` of the `public` schema (every app table, the triggers, and the migration history), custom format, compressed. Supabase's own schemas are left out.
- Encrypted with [age](https://age-encryption.org) to two public keys: the developer's and the hospital's. The server holds only the public keys, so a stolen server or bucket gives nobody the data.
- Uploaded with a manifest: time taken, PostgreSQL and `pg_dump` versions, the latest migration, size and SHA-256. A backup without its manifest is incomplete, and restore refuses it.
- Named `hms-<label>-<UTC time>`, for example `hms-production-20261025T203000Z.dump.age`.

## One-time setup

### 1. The keys (on the developer's machine, never the server)

```bash
age-keygen -o hms-backup-developer.key      # prints the public key, age1...
age-keygen -o hms-backup-hospital.key
```

- Store each private key file in the vault ([secrets-and-rotation.md](secrets-and-rotation.md)), and print the hospital's key on paper for the hospital's safe, with the date.
- Put both public keys in `AGE_RECIPIENTS` in `backup.env`.
- Delete the key files from the laptop once stored.

Losing both private keys makes every backup unreadable. Losing one is fine: the other still opens them. Replace a lost or exposed key with a new pair, and keep the old private key until every backup made with it has expired.

### 2. The bucket

Where the bucket lives is the hospital's decision (go-live checklist stage 2, data in India):

- **Cloudflare R2** is in `CLAUDE.md`, but R2 offers EU and FedRAMP jurisdictions and only a location hint for Asia-Pacific, so it cannot promise the data stays in India.
- **Object storage in an Indian region** (for example Oracle Cloud Object Storage in Mumbai or Hyderabad, or the production host's own) keeps it in India. Any S3-compatible store works: only the `RCLONE_CONFIG_STORE_*` lines change.

Either way:

1. Create it in an account separate from production (its own login, two-factor on), named for example `hms-backups`, with a second bucket `hms-logs` for log exports.
2. **Lock it**: a retention lock (R2 bucket lock rules, or S3 object lock) of at least 35 days, so even a stolen server token cannot delete or overwrite recent backups.
3. **Expire old ones**: a lifecycle rule deleting objects after the retention the hospital chose in stage 2 (at least 90 days until then), and 200 days for `hms-logs`.
4. An API token for this bucket only, with object read and write. Put it in `backup.env`.

### 3. On the server

```bash
cp deploy/env/backup.env.example /opt/hms/env/backup.env && chmod 600 /opt/hms/env/backup.env
# fill in BACKUP_DATABASE_URL, AGE_RECIPIENTS, the store settings and the heartbeat URLs
deploy/backup.sh                                    # a first backup by hand
sudo cp deploy/systemd/hms-backup.service deploy/systemd/hms-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now hms-backup.timer
systemctl list-timers hms-backup.timer
```

The timer runs at 02:00 IST. Once the hospital sets how much data it can afford to lose, change `OnCalendar` (every 6 hours is in the file as an example). `deploy.sh` also takes a backup before every migration and stops if it fails.

Each run pings `BACKUP_PING_URL`, or `BACKUP_PING_FAIL_URL` on failure, so the uptime service alerts both on a failed backup and on a missing one ([monitoring.md](monitoring.md)).

## Restore drill (every quarter, and before go-live)

Restores the newest backup into a throwaway database on the server, checks it, runs the API on it, and touches nothing live.

1. Bring the developer's private key for the drill only, into memory:

   ```bash
   install -m 600 /dev/null /dev/shm/hms-backup.key && nano /dev/shm/hms-backup.key   # paste from the vault
   AGE_IDENTITY_FILE=/dev/shm/hms-backup.key deploy/restore-drill.sh
   shred -u /dev/shm/hms-backup.key
   ```

2. What it does:
   1. starts an empty PostgreSQL 17 container set to IST (the restored data must still read as UTC);
   2. downloads the backup, checks its SHA-256 against the manifest, decrypts and restores it;
   3. runs `deploy/sql/restore-checks.sql`: every UHID, bill and receipt series starts at 1 with no gaps or repeats and matches its counter; issued bills or receipts have audit events, none dated in the future; the protection triggers are present and enabled, and an UPDATE of an audit event or an issued bill and a DELETE of a receipt are refused;
   4. starts the current API image on the restored copy and waits for it to be healthy;
   5. checks that `FIELD_ENCRYPTION_KEY` from `api.env` opens a stored Aadhaar or ABHA number (the number is never shown);
   6. prints a result block with the download and restore times, and appends it to `/opt/hms/state/restore-drills.log`.
3. Copy the block into [restore-drill-log.md](restore-drill-log.md) in a pull request.
4. Also restore one Supabase backup into a new, temporary Supabase project once a year, run `restore-checks.sql` there, and delete the project.

A failed drill is an incident: fix the cause and drill again before the next release.

The CI deploy rehearsal runs a full backup and drill on every pull request that touches `deploy/` or migrations, with a throwaway key and a local folder as the store.

## Real recovery

When the live database is lost or damaged:

1. Tell the hospital to switch to the paper downtime procedure (go-live checklist stage 8). Stop the API so nothing writes: `docker stop hms-api-1`.
2. Choose the source: Supabase point-in-time recovery or a Supabase backup if the project is healthy and the damage is recent; otherwise our newest good backup. Restore into a **new** database (a new Supabase project in Mumbai, set up as in [supabase.md](supabase.md)), never on top of the damaged one, which is kept for the incident report.
3. For our backups: run `hms-backup restore` against the new database with the private key, from the server or a developer machine with Docker:

   ```bash
   docker run --rm -it --env-file /opt/hms/env/backup.env \
     -e RESTORE_DATABASE_URL -e AGE_IDENTITY_FILE=/run/key -v /dev/shm/hms-backup.key:/run/key:ro \
     -v /opt/hms/backup-work:/work hms-backup:$(cat /opt/hms/state/current) restore
   ```

   Then run `deploy/sql/supabase-lockdown.sql` on the new project.
4. Point `DATABASE_URL` and `DIRECT_URL` at the new database, run `deploy/check-database.sh`, then `deploy/restart.sh`.
5. Bills and receipts written on paper since the backup are entered afterwards in number order, as the downtime procedure says. The restore checks show where each series stopped.
6. Record the times (outage, data lost, time to restore) for the incident report and the CERT-In report if one is due.

## Checklist

- [ ] Two age key pairs, private keys in the vault and on paper, public keys in `backup.env`
- [ ] Bucket in a separate account, region decided with the hospital, retention lock and lifecycle rules on
- [ ] `hms-backup.timer` enabled, first backup listed in the bucket, heartbeat alerting
- [ ] Restore drill passed on staging, and on production before go-live, logged in `restore-drill-log.md`
- [ ] Quarterly drill in the calendar
