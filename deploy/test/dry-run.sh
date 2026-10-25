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
# Migrations run before the new containers start.
[[ "$(grep -n 'hms-migrate:v9' <<<"$out" | tail -n 1 | cut -d: -f1)" -lt "$(grep -n 'up --detach' <<<"$out" | head -n 1 | cut -d: -f1)" ]] ||
  { echo "migrations must run before the containers start" >&2; exit 1; }

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

echo "restart.sh"
out="$("$repo/deploy/restart.sh" api 2>&1)"
expect "$out" 'releases/v1\.0\.1/compose\.prod\.yml .* up --detach --wait .*--force-recreate api'
expect "$out" 'would check https://api\.hms\.test/api/v1/health'

echo "setup-firewall.sh"
out="$(SSH_ALLOW_FROM='203.0.113.7/32' EXT_IF=eth0 "$repo/deploy/server/setup-firewall.sh" 2>&1)"
expect "$out" 'ufw default deny incoming'
expect "$out" 'ufw allow proto tcp from 203\.0\.113\.7/32 to any port 22'
expect "$out" '-A DOCKER-USER -i eth0 -s 173\.245\.48\.0/20 -p tcp -m multiport --dports 80,443 -j RETURN'
expect "$out" '-A DOCKER-USER -i eth0 -j DROP'
[[ "$(grep -c 'dports 80,443' <<<"$out")" == 15 ]] || { echo "expected 15 Cloudflare IPv4 ranges" >&2; exit 1; }

echo "all dry runs passed"
