#!/usr/bin/env bash
# Hourly host check: disk space, journald size, and the health of every HMS container. Pings
# HOST_PING_URL from backup.env when all is well, HOST_PING_FAIL_URL otherwise, so the uptime
# service alerts on problems and on silence (docs/runbooks/monitoring.md).
#
# Usage:   deploy/check-host.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

ping_url() { [[ -z "${1:-}" ]] || curl --silent --max-time 10 --retry 3 --output /dev/null "$1" || true; }
backup_env="$HMS_ENV_DIR/backup.env"
ok_url="$(sed -n 's/^HOST_PING_URL=//p' "$backup_env" 2>/dev/null | tail -n 1)"
fail_url="$(sed -n 's/^HOST_PING_FAIL_URL=//p' "$backup_env" 2>/dev/null | tail -n 1)"
problems=()

for mount in / /var/lib/docker; do
  [[ -d "$mount" ]] || continue
  used="$(df --output=pcent "$mount" | tail -n 1 | tr -dc '0-9')"
  [[ "$used" -lt "${DISK_ALERT_PERCENT:-80}" ]] || problems+=("disk $mount is ${used}% full")
done
journal_bytes="$(journalctl --disk-usage 2>/dev/null | grep -oE '[0-9.]+[KMGT]?' | head -n 1 || true)"
for service in api web caddy; do
  id="$(docker ps --quiet --filter label=com.docker.compose.project=hms --filter "label=com.docker.compose.service=$service")"
  if [[ -z "$id" ]]; then
    problems+=("$service is not running")
    continue
  fi
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$id")"
  [[ "$health" == healthy || "$health" == running ]] || problems+=("$service is $health")
done

if [[ "${#problems[@]}" -eq 0 ]]; then
  log "host ok (journal ${journal_bytes:-unknown})"
  ping_url "$ok_url"
else
  log "host problems: ${problems[*]}"
  ping_url "$fail_url"
  exit 1
fi
