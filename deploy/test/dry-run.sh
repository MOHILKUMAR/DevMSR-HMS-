#!/usr/bin/env bash
# Dry runs of the deploy, rollback and firewall scripts against a throwaway $HMS_HOME. Needs bash,
# git and openssl only (no Docker), so it runs on a developer machine as well as in CI.
# Fails if a script errors or leaves out a step it must take.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
export HMS_HOME="$work/hms" DRY_RUN=1
"$repo/deploy/test/make-rehearsal-home.sh" "$HMS_HOME" >/dev/null

expect() {
  local output="$1" pattern="$2"
  grep -qE -- "$pattern" <<<"$output" || {
    printf '%s\n' "$output" >&2
    echo "dry run is missing: $pattern" >&2
    exit 1
  }
}

echo "deploy.sh"
out="$("$repo/deploy/deploy.sh" v9.9.9-dryrun 2>&1)"
expect "$out" 'docker build .*--tag hms-api:v9\.9\.9-dryrun'
expect "$out" 'docker build .*--tag hms-web:v9\.9\.9-dryrun .*NEXT_PUBLIC_API_URL=https://api\.hms\.test/api/v1'
expect "$out" 'docker build .*--file .*/deploy/migrate\.Dockerfile --tag hms-migrate:v9\.9\.9-dryrun'
expect "$out" 'docker run --rm .*--env-file .*/env/migrate\.env .*hms-migrate:v9\.9\.9-dryrun'
expect "$out" 'docker compose --project-name hms --file .*/releases/v9\.9\.9-dryrun/compose\.prod\.yml .* up --detach --wait'
expect "$out" 'would check https://api\.hms\.test/api/v1/health'
expect "$out" 'would check https://app\.hms\.test/login'
expect "$out" 'would set current=v9\.9\.9-dryrun'
expect "$out" 'docker build .*--file .*/deploy/backup/Dockerfile --tag hms-backup:v9\.9\.9-dryrun'
expect "$out" 'docker run --rm .*--env-file .*/env/backup\.env hms-backup:v9\.9\.9-dryrun backup'
line_of() { grep -n -- "$1" <<<"$out" | head -n 1 | cut -d: -f1; }
# Backup, then migrations, then the new containers.
[[ "$(line_of 'hms-backup:v9.9.9-dryrun backup')" -lt "$(line_of 'docker run .*hms-migrate:v9.9.9-dryrun$')" ]] ||
  { echo "the backup must run before migrations" >&2; exit 1; }
[[ "$(line_of 'docker run .*hms-migrate:v9.9.9-dryrun$')" -lt "$(line_of 'up --detach')" ]] ||
  { echo "migrations must run before the containers start" >&2; exit 1; }
expect "$out" 'docker run --rm .*--env-file .*/env/api\.env --env-file .*/env/migrate\.env .*hms-api:v9\.9\.9-dryrun node dist/cli/create-api-db-user\.js'
expect "$out" 'docker run --rm .*--env-file .*/env/api\.env .*hms-api:v9\.9\.9-dryrun node dist/cli/sync-roles\.js --apply'
# The API login and the role sync come after the migrations and before the new containers.
first_line() { grep -n -- "$1" <<<"$out" | head -n 1 | cut -d: -f1; }
[[ "$(first_line 'docker run .*hms-migrate:v9.9.9-dryrun$')" -lt "$(first_line 'create-api-db-user')" &&
  "$(first_line 'create-api-db-user')" -lt "$(first_line 'sync-roles')" &&
  "$(first_line 'sync-roles')" -lt "$(first_line 'up --detach')" ]] ||
  { echo "order must be: migrations, API login, role sync, containers" >&2; exit 1; }

echo "deploy.sh rejects a bad tag"
if "$repo/deploy/deploy.sh" latest >/dev/null 2>&1; then
  echo "deploy.sh accepted the tag 'latest'" >&2
  exit 1
fi

echo "rollback.sh"
printf 'v1.0.1\n' >"$HMS_HOME/state/current"
printf 'v1.0.0\n' >"$HMS_HOME/state/previous"
out="$("$repo/deploy/rollback.sh" 2>&1)"
expect "$out" 'releases/v1\.0\.0/compose\.prod\.yml .* up --detach --wait'
expect "$out" 'would set current=v1\.0\.0'
expect "$out" 'would set previous=v1\.0\.1'
expect "$out" 'hms-api:v1\.0\.0 node dist/cli/sync-roles\.js --apply'

echo "restart.sh"
out="$("$repo/deploy/restart.sh" api 2>&1)"
expect "$out" 'releases/v1\.0\.1/compose\.prod\.yml .* up --detach --wait .*--force-recreate api'
expect "$out" 'would check https://api\.hms\.test/api/v1/health'

echo "backup.sh"
out="$("$repo/deploy/backup.sh" 2>&1)"
expect "$out" 'docker run --rm .*--user [0-9]+:[0-9]+ --read-only .*--volume .*/backup-work:/work --volume .*/local-store/store/backups:/store/backups .*hms-backup:v1\.0\.1 backup'

echo "restore-drill.sh"
out="$(AGE_IDENTITY_FILE=/dev/null "$repo/deploy/restore-drill.sh" 2>&1)"
expect "$out" 'docker run --detach --rm --name hms-drill-[0-9]+-db .*TZ=Asia/Kolkata'
expect "$out" 'hms-backup:v1\.0\.1 restore'
expect "$out" 'hms-drill-[0-9]+-api .*--env APP_ENV=staging'
expect "$out" 'docker run --detach --rm --name hms-drill-[0-9]+-api .*--read-only .*hms-api:v1\.0\.1'

echo "logs-export.sh"
out="$("$repo/deploy/logs-export.sh" 2026-10-24 2>&1)"
expect "$out" "journalctl --utc --since '2026-10-24 00:00:00' --until '2026-10-25 00:00:00'.*hms-backup put journal-.*-2026-10-24\.json\.gz\.age"

echo "setup-firewall.sh"
out="$(SSH_ALLOW_FROM='203.0.113.7/32' EXT_IF=eth0 "$repo/deploy/server/setup-firewall.sh" 2>&1)"
expect "$out" 'ufw default deny incoming'
expect "$out" 'ufw allow proto tcp from 203\.0\.113\.7/32 to any port 22'
expect "$out" '-A DOCKER-USER -i eth0 -s 173\.245\.48\.0/20 -p tcp -m multiport --dports 80,443 -j RETURN'
expect "$out" '-A DOCKER-USER -i eth0 -j DROP'
[[ "$(grep -c 'dports 80,443' <<<"$out")" == 15 ]] || { echo "expected 15 Cloudflare IPv4 ranges" >&2; exit 1; }

echo "seed-staging.sh"
out="$(SEED_USER_PASSWORD='rehearsal-only-Passw0rd' "$repo/deploy/seed-staging.sh" 2>&1)"
expect "$out" 'docker build .*--file .*/deploy/seed\.Dockerfile --tag hms-seed:v1\.0\.1'
expect "$out" 'docker run --rm --name hms-seed-v1\.0\.1 --env-file .*/env/api\.env --env NODE_ENV=development --env SEED_USER_PASSWORD --env SEED_TOTP_SECRET= '
# The password goes to the container by name only, never on a command line.
if grep -q 'rehearsal-only-Passw0rd' <<<"$out"; then echo "seed-staging.sh printed the password" >&2; exit 1; fi

echo "seed-staging.sh refuses production and short passwords"
cp "$HMS_HOME/env/api.env" "$work/api.env.staging"
sed 's/^APP_ENV=.*/APP_ENV=production/' "$work/api.env.staging" >"$HMS_HOME/env/api.env"
if SEED_USER_PASSWORD='rehearsal-only-Passw0rd' "$repo/deploy/seed-staging.sh" >/dev/null 2>&1; then
  echo "seed-staging.sh ran with APP_ENV=production" >&2
  exit 1
fi
cp "$work/api.env.staging" "$HMS_HOME/env/api.env"
if SEED_USER_PASSWORD='short' "$repo/deploy/seed-staging.sh" >/dev/null 2>&1; then
  echo "seed-staging.sh took a password under 12 characters" >&2
  exit 1
fi

echo "all dry runs passed"
