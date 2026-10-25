#!/usr/bin/env bash
# Recreates containers of the current release so they pick up a changed env file or certificate
# (docs/runbooks/secrets-and-rotation.md), then checks health.
#
# Usage:   deploy/restart.sh              every service
#          deploy/restart.sh api caddy    only these
# Options: DRY_RUN=1 prints every command instead of running it.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

load_deploy_env
acquire_lock
current="$(read_state current)"
[[ -n "$current" ]] || die "no current release recorded"

log "recreating ${*:-all services} of $current"
compose "$current" up --detach --wait --wait-timeout 180 --force-recreate "$@"
public_check || die "unhealthy after the restart: check the env file just changed, then the logs"
record_history restart "$current"
log "restarted"
