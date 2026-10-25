#!/usr/bin/env bash
# Restore drill: restores a backup into a throwaway PostgreSQL container, checks it, starts the
# current API image on it, and proves the field encryption key in api.env still opens the backup's
# Aadhaar and ABHA numbers. Touches nothing live. Prints a result block for
# docs/runbooks/restore-drill-log.md and appends it to $HMS_HOME/state/restore-drills.log.
#
# Usage:   AGE_IDENTITY_FILE=/dev/shm/hms-backup-key.txt deploy/restore-drill.sh [backup-name]
#          (default: the newest backup). The private key is brought for the drill and deleted after.
# Options: DRY_RUN=1 prints every command instead of running it.
# Runbook: docs/runbooks/backup-and-restore.md
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

backup_env="$HMS_ENV_DIR/backup.env"
[[ -f "$backup_env" ]] || die "missing $backup_env"
: "${AGE_IDENTITY_FILE:?set AGE_IDENTITY_FILE to the backup private key file}"
dry_run || [[ -r "$AGE_IDENTITY_FILE" ]] || die "cannot read $AGE_IDENTITY_FILE"
tag="${DRILL_TAG:-$(read_state current)}"
[[ -n "$tag" ]] || die "no current release recorded; set DRILL_TAG"
backup_name="${1:-}"

drill="hms-drill-$(date -u +%Y%m%d%H%M%S)"
db_password="$(openssl rand -hex 24)"
restore_url="postgresql://hms:$db_password@$drill-db:5432/hms_restore"
# shellcheck disable=SC2064 # names are fixed now
trap "docker rm --force '$drill-api' '$drill-db' >/dev/null 2>&1 || true; docker network rm '$drill' >/dev/null 2>&1 || true" EXIT
started=$SECONDS

log "drill $drill: restoring ${backup_name:-the newest backup} with release $tag"
run docker network create "$drill" >/dev/null
# A fresh database in IST, like many Indian servers: the restored data must still read as UTC.
run docker run --detach --rm --name "$drill-db" --network "$drill" \
  --env POSTGRES_USER=hms --env "POSTGRES_PASSWORD=$db_password" --env POSTGRES_DB=hms_restore \
  --env TZ=Asia/Kolkata --volume /var/lib/postgresql/data \
  postgres:17-alpine >/dev/null
if ! dry_run; then
  # Over TCP: while the image initialises the database it runs a temporary server on the Unix
  # socket only, which a socket check would wrongly take as ready.
  db_ready=no
  for _ in $(seq 1 60); do
    if docker exec "$drill-db" pg_isready -h 127.0.0.1 -U hms -d hms_restore >/dev/null 2>&1; then
      db_ready=yes
      break
    fi
    sleep 1
  done
  [[ "$db_ready" == yes ]] || die "the throwaway database did not start"
fi

# 1. Download, verify, decrypt, restore and run deploy/sql/restore-checks.sql.
prepare_backup_container "$backup_env"
result="$(
  run docker run --rm --network "$drill" \
    "${backup_container_opts[@]}" \
    --env-file "$backup_env" \
    --env "RESTORE_DATABASE_URL=$restore_url" \
    --env AGE_IDENTITY_FILE=/run/age-identity \
    --volume "$AGE_IDENTITY_FILE:/run/age-identity:ro" \
    "hms-backup:$tag" restore ${backup_name:+"$backup_name"}
)" || die "restore or restore checks failed: see the output above"
# 2. Start the API on the restored copy. Its own session secret; the real field key, so step 3 proves it.
# APP_ENV=staging: the copy has no API login or Sentry, which only the production guard requires.
# 2. Start the API on the restored copy. Its own session secret; the real field key, so step 3 proves it.
field_key="$(sed -n 's/^FIELD_ENCRYPTION_KEY=//p' "$HMS_ENV_DIR/api.env" | tail -n 1)"
[[ -n "$field_key" ]] || dry_run || die "FIELD_ENCRYPTION_KEY missing in api.env"
# Passed by name, so the key never appears on a command line.
export FIELD_ENCRYPTION_KEY="$field_key"
run docker run --detach --rm --name "$drill-api" --network "$drill" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true \
  --env NODE_ENV=production --env APP_ENV=staging --env CORS_ORIGINS=https://drill.invalid \
  --env DATABASE_URL="$restore_url" --env SESSION_SECRET="$(openssl rand -base64 32)" --env FIELD_ENCRYPTION_KEY \
  "hms-api:$tag" >/dev/null
api_health=skipped
if ! dry_run; then
  api_health=unhealthy
  for _ in $(seq 1 40); do
    api_health="$(docker inspect --format '{{.State.Health.Status}}' "$drill-api" 2>/dev/null || echo gone)"
    [[ "$api_health" == healthy || "$api_health" == gone ]] && break
    sleep 3
  done
  [[ "$api_health" == healthy ]] || { docker logs --tail 50 "$drill-api" 2>&1 || true; die "the API did not become healthy on the restored database"; }
fi
log "API $tag is $api_health on the restored database"

# 3. The field key from api.env opens a stored Aadhaar or ABHA number (the value is never printed).
field_key_check=skipped
if ! dry_run; then
  sample="$(docker exec "$drill-db" psql -U hms -d hms_restore -X -A -t -c \
    "SELECT 'aadhaar ' || aadhaar_encrypted FROM patients WHERE aadhaar_encrypted IS NOT NULL
     UNION ALL SELECT 'abha_number ' || abha_number_encrypted FROM patients WHERE abha_number_encrypted IS NOT NULL
     LIMIT 1")"
  if [[ -z "$sample" ]]; then
    field_key_check="no encrypted numbers in this backup"
  elif docker exec "$drill-api" node --input-type=module -e "
      const { createFieldCipher } = await import('/app/dist/common/crypto/field-encryption.js');
      const [field, value] = process.argv[1].split(' ');
      const digits = createFieldCipher(process.env.FIELD_ENCRYPTION_KEY).reveal(field, value);
      process.exit(/^[0-9]{12,14}\$/.test(digits) ? 0 : 1);" "$sample" >/dev/null 2>&1; then
    field_key_check=passed
  else
    die "the FIELD_ENCRYPTION_KEY in api.env does NOT open this backup's encrypted numbers"
  fi
fi
log "field key check: $field_key_check"

report="restore drill $(date -u +%Y-%m-%dT%H:%M:%SZ) on $(hostname)
release=$tag
$result
api_on_restored_copy=$api_health
field_key_check=$field_key_check
total_seconds=$((SECONDS - started))"
if dry_run; then
  log "dry run: would record the drill report"
else
  printf '%s\n\n' "$report" >>"$HMS_STATE_DIR/restore-drills.log"
fi
printf '%s\n' "$report"
log "drill passed: copy the block above into docs/runbooks/restore-drill-log.md"
