#!/usr/bin/env bash
# Copies one UTC day of the server's journal (API, web and Caddy containers, plus SSH, sudo, Docker
# and the kernel) to LOG_STORE, compressed and encrypted to the backup keys. journald keeps 190 days
# on the server itself; this copy survives the server (docs/runbooks/log-retention.md).
# Run daily by the hms-logs-export systemd timer.
#
# Usage:   deploy/logs-export.sh [YYYY-MM-DD]     (default: yesterday, UTC)
# Options: DRY_RUN=1 prints every command instead of running it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

backup_env="$HMS_ENV_DIR/backup.env"
[[ -f "$backup_env" ]] || die "missing $backup_env"
tag="$(read_state current)"
[[ -n "$tag" ]] || die "no current release recorded"
day="${1:-$(date -u -d yesterday +%Y-%m-%d)}"
[[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || die "usage: logs-export.sh [YYYY-MM-DD]"
next_day="$(date -u -d "$day + 1 day" +%Y-%m-%d)"
name="journal-$(hostname)-$day.json.gz.age"

prepare_backup_container "$backup_env"
if dry_run; then
  log "dry run: journalctl --utc --since '$day 00:00:00' --until '$next_day 00:00:00' --output json | gzip | hms-backup put $name"
  exit 0
fi
lines="$(journalctl --utc --since "$day 00:00:00" --until "$next_day 00:00:00" --quiet | wc -l)"
[[ "$lines" -gt 0 ]] || die "no journal entries for $day: is journald persistent and readable by $(id -un)?"
journalctl --utc --since "$day 00:00:00" --until "$next_day 00:00:00" --output json --no-pager |
  gzip -9 |
  docker run --rm --interactive "${backup_container_opts[@]}" --env-file "$backup_env" "hms-backup:$tag" put "$name"
log "exported $lines journal entries for $day as $name"
