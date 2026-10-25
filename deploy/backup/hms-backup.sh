#!/usr/bin/env bash
# Encrypted database backups, restores and log uploads. Runs inside the hms-backup image
# (deploy/backup/Dockerfile), started by deploy/backup.sh, deploy/restore-drill.sh and
# deploy/logs-export.sh. Also runs on any machine with pg_dump, psql, age and (for a remote store) rclone.
#
#   hms-backup backup               pg_dump the public schema, encrypt to the age recipients, upload
#                                   with a manifest (name, time, sizes, SHA-256, latest migration)
#   hms-backup list                 backups in the store, oldest first
#   hms-backup restore [name]       download a backup (default: the newest), check its SHA-256,
#                                   decrypt, restore into an EMPTY database, run the restore checks
#   hms-backup put <name>           encrypt standard input and upload it to the log store
#
# Settings (deploy/env/backup.env.example):
#   BACKUP_DATABASE_URL   the database to back up (session or direct connection)
#   BACKUP_STORE          rclone remote and path, for example backup:hms-backups/production,
#                         or a local folder starting with / (tests and rehearsals only)
#   LOG_STORE             the same, for logs
#   AGE_RECIPIENTS        age public keys, space separated; backups open with any matching private key
#   BACKUP_LABEL          production or staging, part of every file name
#   BACKUP_PING_URL, BACKUP_PING_FAIL_URL   optional heartbeat URLs for monitoring
#   RESTORE_DATABASE_URL, AGE_IDENTITY_FILE  restore only
# Nothing here prints a connection string, a key or a row of data.
set -euo pipefail

work="${BACKUP_WORK_DIR:-/work}"
sql_dir="${HMS_SQL_DIR:-/usr/local/share/hms}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "error: $*"
  exit 1
}

is_local() { [[ "$1" == /* ]]; }

store_put() { # file store name
  if is_local "$2"; then
    mkdir -p "$2" && cp "$1" "$2/$3"
  else
    rclone copyto --s3-no-check-bucket "$1" "$2/$3"
  fi
}

store_get() { # store name file
  if is_local "$1"; then
    cp "$1/$2" "$3"
  else
    rclone copyto "$1/$2" "$3"
  fi
}

store_list() { # store
  if is_local "$1"; then
    if [[ -d "$1" ]]; then ls -1 "$1"; fi
  else
    rclone lsf "$1"
  fi
}

ping_url() {
  [[ -n "${1:-}" ]] || return 0
  curl --silent --show-error --max-time 10 --retry 3 --output /dev/null "$1" || log "warning: heartbeat ping failed"
}

sha256() { sha256sum "$1" | cut -d' ' -f1; }

backup() {
  : "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL is required}" "${BACKUP_STORE:?BACKUP_STORE is required}"
  : "${AGE_RECIPIENTS:?AGE_RECIPIENTS is required}"
  local label="${BACKUP_LABEL:-production}" taken_at name dump manifest
  local -a recipients=()
  local key
  for key in $AGE_RECIPIENTS; do recipients+=(--recipient "$key"); done

  local now
  now="$(date -u +%s)"
  taken_at="$(date -u -d "@$now" +%Y-%m-%dT%H:%M:%SZ)"
  name="hms-$label-$(date -u -d "@$now" +%Y%m%dT%H%M%SZ)"
  dump="$work/$name.dump.age"
  manifest="$work/$name.manifest"
  mkdir -p "$work"
  # A failed run leaves nothing behind and tells monitoring.
  trap 'rm -f -- "$dump" "$manifest"; ping_url "${BACKUP_PING_FAIL_URL:-}"' ERR

  log "backing up to $name"
  local latest_migration server_version size started=$SECONDS
  server_version="$(psql "$BACKUP_DATABASE_URL" -X -A -t -c 'SHOW server_version')"
  # A database not migrated yet (the first deploy) has no migrations table.
  latest_migration=none
  if [[ "$(psql "$BACKUP_DATABASE_URL" -X -A -t -c "SELECT to_regclass('public._prisma_migrations') IS NOT NULL")" == t ]]; then
    latest_migration="$(psql "$BACKUP_DATABASE_URL" -X -A -t -c \
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")"
  fi
  # Only the app's schema: Supabase's own schemas are not ours to restore. Owners and grants are
  # left out so the dump restores into any fresh database.
  pg_dump "$BACKUP_DATABASE_URL" --format=custom --compress=6 --schema=public --no-owner --no-privileges |
    age --encrypt "${recipients[@]}" >"$dump"

  {
    echo "name=$name"
    echo "taken_at=$taken_at"
    echo "label=$label"
    echo "server_version=$server_version"
    echo "pg_dump_version=$(pg_dump --version | awk '{ print $NF }')"
    echo "latest_migration=$latest_migration"
    size="$(wc -c <"$dump" | tr -d ' ')"
    echo "size_bytes=$size"
    echo "sha256=$(sha256 "$dump")"
  } >"$manifest"
  store_put "$dump" "$BACKUP_STORE" "$name.dump.age"
  # The manifest goes last: a backup without one is incomplete and restore refuses it.
  store_put "$manifest" "$BACKUP_STORE" "$name.manifest"
  rm -f -- "$dump" "$manifest"
  trap - ERR
  log "backup $name done in $((SECONDS - started)) s ($size bytes encrypted)"
  ping_url "${BACKUP_PING_URL:-}"
}

store_manifest() { # name, prints the manifest
  local file="$work/.manifest.$$"
  store_get "$BACKUP_STORE" "$1.manifest" "$file"
  cat "$file"
  rm -f -- "$file"
}

list_backups() {
  : "${BACKUP_STORE:?BACKUP_STORE is required}"
  store_list "$BACKUP_STORE" | sed -n 's/\.manifest$//p' | sort
}

restore() {
  : "${BACKUP_STORE:?BACKUP_STORE is required}" "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"
  : "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE is required (the offline private key)}"
  [[ -r "$AGE_IDENTITY_FILE" ]] || die "cannot read AGE_IDENTITY_FILE"
  if [[ -n "${BACKUP_DATABASE_URL:-}" && "$RESTORE_DATABASE_URL" == "$BACKUP_DATABASE_URL" ]]; then
    die "RESTORE_DATABASE_URL is the live database: restore only into a fresh one"
  fi
  local tables
  tables="$(psql "$RESTORE_DATABASE_URL" -X -A -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
  [[ "$tables" == 0 ]] || die "the target database already has $tables tables: restore only into an empty database"

  mkdir -p "$work"
  local name="${1:-}"
  [[ -n "$name" ]] || name="$(list_backups | tail -n 1)"
  [[ -n "$name" ]] || die "no backups in the store"
  local dump="$work/$name.dump.age" manifest started=$SECONDS
  # shellcheck disable=SC2064 # expand now: the local is gone when the trap runs
  trap "rm -f -- '$dump'" EXIT

  log "downloading $name"
  manifest="$(store_manifest "$name")" || die "$name has no manifest: incomplete backup"
  store_get "$BACKUP_STORE" "$name.dump.age" "$dump"
  local expected actual
  expected="$(sed -n 's/^sha256=//p' <<<"$manifest")"
  actual="$(sha256 "$dump")"
  [[ "$expected" == "$actual" ]] || die "SHA-256 mismatch: the backup file is damaged or was changed"
  log "SHA-256 matches the manifest"
  local downloaded=$SECONDS

  log "decrypting and restoring"
  # The dump creates the public schema itself. A fresh database already has an empty one; plain DROP
  # (no CASCADE) refuses if anything is in it.
  psql "$RESTORE_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public'
  age --decrypt --identity "$AGE_IDENTITY_FILE" <"$dump" |
    pg_restore --dbname "$RESTORE_DATABASE_URL" --no-owner --no-privileges --exit-on-error --single-transaction
  local restored=$SECONDS

  log "running the restore checks"
  local taken_at
  taken_at="$(sed -n 's/^taken_at=//p' <<<"$manifest")"
  psql "$RESTORE_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v "backup_taken_at=$taken_at" \
    -f "$sql_dir/restore-checks.sql" >&2

  {
    echo "backup=$name"
    grep -E '^(taken_at|latest_migration|size_bytes|server_version)=' <<<"$manifest"
    echo "download_seconds=$((downloaded - started))"
    echo "restore_seconds=$((restored - downloaded))"
    echo "checks=passed"
  } | tee "$work/last-restore.txt"  # the only lines on standard output: callers keep them as the report
}

put() {
  local name="${1:?usage: hms-backup put <name>}"
  : "${LOG_STORE:?LOG_STORE is required}" "${AGE_RECIPIENTS:?AGE_RECIPIENTS is required}"
  local -a recipients=()
  local key file="$work/$name"
  for key in $AGE_RECIPIENTS; do recipients+=(--recipient "$key"); done
  mkdir -p "$work"
  # shellcheck disable=SC2064 # expand now: the local is gone when the trap runs
  trap "rm -f -- '$file'" EXIT
  age --encrypt "${recipients[@]}" >"$file"
  store_put "$file" "$LOG_STORE" "$name"
  log "uploaded $name ($(wc -c <"$file" | tr -d ' ') bytes)"
}

command="${1:-}"
shift || true
case "$command" in
  backup) backup ;;
  list) list_backups ;;
  restore) restore "$@" ;;
  put) put "$@" ;;
  *) die "usage: hms-backup backup | list | restore [name] | put <name>" ;;
esac
