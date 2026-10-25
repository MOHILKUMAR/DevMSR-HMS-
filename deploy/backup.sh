#!/usr/bin/env bash
# Takes an encrypted backup of the database now, with the current release's hms-backup image.
# Run nightly by the hms-backup systemd timer, and by deploy.sh before every migration.
#
# Usage:   deploy/backup.sh
# Options: DRY_RUN=1 prints every command instead of running it.
#          BACKUP_TAG picks the image tag (deploy.sh passes the release it just built).
# Runbook: docs/runbooks/backup-and-restore.md
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

backup_env="$HMS_ENV_DIR/backup.env"
[[ -f "$backup_env" ]] || die "missing $backup_env (copy deploy/env/backup.env.example)"
tag="${BACKUP_TAG:-$(read_state current)}"
[[ -n "$tag" ]] || die "no current release recorded; set BACKUP_TAG"

prepare_backup_container "$backup_env"
run docker run --rm --name "hms-backup-$(date -u +%Y%m%d%H%M%S)" \
  "${backup_container_opts[@]}" \
  --env-file "$backup_env" \
  "hms-backup:$tag" backup
