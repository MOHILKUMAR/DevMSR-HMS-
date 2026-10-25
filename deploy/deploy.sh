#!/usr/bin/env bash
# Deploys a release tag on this server: build the images from the tag, apply migrations, start the
# containers, check them through the public URLs, and keep the previous release for rollback.
# If the new release is unhealthy, the previous one is started again.
#
# Usage:   deploy/deploy.sh v1.4.0
# Options: DRY_RUN=1 prints every command instead of running it.
#          SKIP_BACKUP=1 skips the backup before migrations (only before backup.env exists).
#          HMS_HOME (default /opt/hms), KEEP_RELEASES (default 3).
#          HMS_REHEARSAL=1 skips the fetch and the release branch check (CI rehearsal only).
# Runbook: docs/runbooks/deploy-and-rollback.md
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

tag="${1:-}"
[[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || die "usage: deploy.sh vMAJOR.MINOR.PATCH (got '$tag')"

repo="$(git -C "$script_dir/.." rev-parse --show-toplevel)"
load_deploy_env
acquire_lock
release_branch="${HMS_RELEASE_BRANCH:-main}"

# 1. Find the tag and check it was released from the release branch.
if [[ "${HMS_REHEARSAL:-0}" == 1 ]]; then
  log "rehearsal: skipping the fetch and the $release_branch check"
else
  run git -C "$repo" fetch --quiet --tags origin "$release_branch"
fi
if ! commit="$(git -C "$repo" rev-parse --verify --quiet "refs/tags/$tag^{commit}")"; then
  dry_run || die "tag $tag not found"
  commit="$(git -C "$repo" rev-parse HEAD)"
  log "dry run: tag $tag not found locally, using HEAD $commit"
fi
if [[ "${HMS_REHEARSAL:-0}" != 1 ]] && ! dry_run; then
  git -C "$repo" merge-base --is-ancestor "$commit" "origin/$release_branch" ||
    die "$tag ($commit) is not on origin/$release_branch"
fi
previous="$(read_state current)"
log "deploying $tag ($commit), current release: ${previous:-none}"

# 2. Export the tagged tree. Building from an export, not a checkout, means this script never
#    changes under itself and local edits on the server never reach an image.
build_dir="$(mktemp -d)"
trap 'rm -rf -- "$build_dir"' EXIT
git -C "$repo" archive "$commit" | tar -x -C "$build_dir"

release_dir="$HMS_RELEASES_DIR/$tag"
run mkdir -p "$release_dir" "$HMS_HOME/db-certs"
run cp "$build_dir/deploy/compose.prod.yml" "$build_dir/deploy/Caddyfile" "$release_dir/"
run cp -R "$build_dir/deploy/caddy" "$release_dir/"

# 3. Build the images. NEXT_PUBLIC_ values are inlined into the browser bundle, so they are build
#    arguments and never secrets.
build() {
  local image="$1" dockerfile="$2"
  shift 2
  log "building $image:$tag"
  run docker build --quiet --file "$build_dir/$dockerfile" --tag "$image:$tag" \
    --label "org.opencontainers.image.revision=$commit" \
    --label "org.opencontainers.image.version=$tag" \
    "$@" "$build_dir" >/dev/null
}
build hms-api apps/api/Dockerfile
build hms-web apps/web/Dockerfile \
  --build-arg "NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:?NEXT_PUBLIC_API_URL missing in deploy.env}" \
  --build-arg "NEXT_PUBLIC_APP_ENV=${NEXT_PUBLIC_APP_ENV:-production}" \
  --build-arg "NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN:-}"
build hms-migrate deploy/migrate.Dockerfile
build hms-backup deploy/backup/Dockerfile

# 4. Back up first, so a migration that goes wrong can be undone by a restore. SKIP_BACKUP=1 only for
#    a server without backup.env yet (the first staging deploy).
if [[ -f "$HMS_ENV_DIR/backup.env" && "${SKIP_BACKUP:-0}" != 1 ]]; then
  log "backing up before migrations"
  BACKUP_TAG="$tag" "$script_dir/backup.sh" || die "backup failed, nothing was changed: fix it or set SKIP_BACKUP=1 knowingly"
else
  log "warning: no backup before migrations (backup.env missing or SKIP_BACKUP=1)"
fi

# 5. Apply migrations while the current release is still serving. Migrations must keep the previous
#    release working (expand first, contract in a later release), because a rollback never undoes them.
log "applying migrations"
run docker run --rm --name "hms-migrate-$tag" \
  --env-file "$HMS_ENV_DIR/migrate.env" \
  --cap-drop ALL --security-opt no-new-privileges:true \
  "hms-migrate:$tag"

# 6. Start the new release, or go back to the previous one.
if ! activate_release "$tag"; then
  record_history deploy-failed "$tag" "$commit"
  if [[ -n "$previous" && "$previous" != "$tag" ]]; then
    log "$tag is unhealthy, starting $previous again"
    activate_release "$previous" || die "rollback to $previous failed too: follow the manual steps in the runbook"
    record_history auto-rollback "$previous"
    die "$tag was not deployed; $previous is running"
  fi
  die "$tag is unhealthy and there is no previous release to go back to"
fi

if [[ "$previous" != "$tag" ]]; then
  write_state previous "$previous"
fi
write_state current "$tag"
record_history deploy "$tag" "$commit"
prune_releases
log "deployed $tag"
