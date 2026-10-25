#!/usr/bin/env bash
# Starts an earlier release again from the images kept on this server. Database migrations are not
# undone: every migration keeps the previous release working (docs/runbooks/deploy-and-rollback.md).
#
# Usage:   deploy/rollback.sh           back to the previous release
#          deploy/rollback.sh v1.3.2    back to a release that is still kept (see state/history.log)
# Options: DRY_RUN=1 prints every command instead of running it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

load_deploy_env
acquire_lock

current="$(read_state current)"
target="${1:-$(read_state previous)}"
[[ -n "$target" ]] || die "no previous release recorded; name a tag"
[[ "$target" != "$current" ]] || die "$target is already the current release"
if ! dry_run; then
  [[ -d "$HMS_RELEASES_DIR/$target" ]] || die "release folder for $target was pruned; deploy it again instead"
  for image in hms-api hms-web; do
    docker image inspect "$image:$target" >/dev/null 2>&1 || die "$image:$target was pruned; deploy it again instead"
  done
fi

log "rolling back from ${current:-none} to $target"
activate_release "$target" || die "$target is unhealthy too: follow the manual steps in the runbook"

write_state previous "$current"
write_state current "$target"
record_history rollback "$target"
log "running $target"
