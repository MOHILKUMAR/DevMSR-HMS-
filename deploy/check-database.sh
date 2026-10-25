#!/usr/bin/env bash
# Checks that the connection the API uses keeps what the app relies on (docs/runbooks/supabase.md):
#   1. every connection and every transaction runs in UTC with the app's startup option
#      (decisions.md, "Database sessions run in UTC");
#   2. a transaction stays on one database backend from BEGIN to COMMIT;
#   3. a lock taken inside a transaction blocks a second connection until COMMIT, which is what the
#      gapless counters need.
# A transaction pooler can break 1 by dropping the startup option. Run this against staging, and
# against production before go-live, whenever DATABASE_URL changes.
#
# Usage:   deploy/check-database.sh [env-file]     (default $HMS_HOME/env/api.env)
#          deploy/check-database.sh --row-lock     also locks one real number_counters row for 4 seconds:
#                                                  quiet hours or staging only
# Uses psql when installed, otherwise the postgres:17-alpine image. The URL is never printed.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

row_lock=0
env_file="$HMS_ENV_DIR/api.env"
for arg in "$@"; do
  case "$arg" in
    --row-lock) row_lock=1 ;;
    *) env_file="$arg" ;;
  esac
done

if [[ -z "${DATABASE_URL:-}" ]]; then
  [[ -f "$env_file" ]] || die "set DATABASE_URL or pass the env file that holds it"
  DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' "$env_file" | tail -n 1)"
fi
[[ -n "$DATABASE_URL" ]] || die "DATABASE_URL is empty"
export DATABASE_URL
# The same startup option the API sends (apps/api/src/common/prisma/create-prisma-client.ts).
export PGOPTIONS='-c TimeZone=UTC'

sql() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -X -q -A -t -v ON_ERROR_STOP=1 "$@"
  else
    docker run --rm -i --network host -e DATABASE_URL -e PGOPTIONS postgres:17-alpine \
      sh -c 'exec psql "$DATABASE_URL" "$@"' psql -X -q -A -t -v ON_ERROR_STOP=1 "$@"
  fi
}

failures=0
pass() { log "PASS $*"; }
fail() {
  log "FAIL $*"
  failures=$((failures + 1))
}

log "server: $(sql -c 'SHOW server_version')"
default_tz="$(PGOPTIONS='' sql -c 'SHOW TimeZone')"
if [[ "$default_tz" == UTC || "$default_tz" == Etc/UTC ]]; then
  pass "database default time zone is $default_tz"
else
  log "note: database default time zone is $default_tz, so the app depends on its startup option"
fi

# 1. Five separate transactions on one connection. Through a transaction pooler each may land on a
#    different backend, which is exactly when a startup option can be lost.
mapfile -t rows < <(sql -c "SELECT current_setting('TimeZone') || ' ' || pg_backend_pid()" \
  -c "SELECT current_setting('TimeZone') || ' ' || pg_backend_pid()" \
  -c "SELECT current_setting('TimeZone') || ' ' || pg_backend_pid()" \
  -c "SELECT current_setting('TimeZone') || ' ' || pg_backend_pid()" \
  -c "SELECT current_setting('TimeZone') || ' ' || pg_backend_pid()")
zones="$(printf '%s\n' "${rows[@]}" | awk '{ print $1 }' | sort -u | tr '\n' ' ')"
backends="$(printf '%s\n' "${rows[@]}" | awk '{ print $2 }' | sort -u | wc -l | tr -d ' ')"
if [[ "$zones" == 'UTC ' ]]; then
  pass "every transaction ran in UTC ($backends backend(s) for 5 transactions)"
else
  fail "time zones seen: $zones(expected only UTC)"
fi
[[ "$backends" -gt 1 ]] && log "note: transactions moved between backends, so this is a transaction pooler"

# 2. One transaction, one backend.
mapfile -t pids < <(sql <<'SQL'
BEGIN;
SELECT pg_backend_pid();
SELECT pg_sleep(0.3);
SELECT pg_backend_pid();
COMMIT;
SQL
)
pids_seen="$(printf '%s\n' "${pids[@]}" | awk 'NF' | sort -u | wc -l | tr -d ' ')"
if [[ "$pids_seen" == 1 ]]; then
  pass "a transaction stayed on one backend"
else
  fail "a transaction moved between backends"
fi

# 3. A transaction-scoped lock blocks a second connection until COMMIT, then frees.
#    Advisory locks follow the same transaction rules as row locks and touch no business data.
lock_key=4271001
holder_sql="BEGIN; SELECT pg_advisory_xact_lock($lock_key); SELECT pg_sleep(4); COMMIT;"
probe_sql="SELECT pg_try_advisory_xact_lock($lock_key)"
if [[ "$row_lock" == 1 ]]; then
  holder_sql="BEGIN; SELECT 1 FROM number_counters ORDER BY hospital_id, kind, period LIMIT 1 FOR UPDATE; SELECT pg_sleep(4); COMMIT;"
  probe_sql="BEGIN; SELECT count(*) FROM (SELECT 1 FROM number_counters ORDER BY hospital_id, kind, period LIMIT 1 FOR UPDATE SKIP LOCKED) locked; COMMIT;"
fi
sql -c "$holder_sql" >/dev/null &
holder=$!
sleep 1.5
while_held="$(sql -c "$probe_sql" | awk 'NF' | tail -n 1)"
wait "$holder"
after_commit="$(sql -c "$probe_sql" | awk 'NF' | tail -n 1)"
# The advisory probe answers t or f. The row probe counts rows it could lock: 0 while held, 1 after.
if [[ "$while_held" =~ ^(f|0)$ && "$after_commit" =~ ^(t|1)$ ]]; then
  pass "a lock held by one transaction blocked another connection until COMMIT"
else
  fail "lock not held across connections (while held: '$while_held', after commit: '$after_commit')"
fi

if [[ "$failures" -gt 0 ]]; then
  die "$failures check(s) failed: use a session pooler or a direct connection (docs/runbooks/supabase.md)"
fi
log "all database connection checks passed"
