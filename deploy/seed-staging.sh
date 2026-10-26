#!/usr/bin/env bash
# Loads the fake demo hospital (staff for every role, wards, beds, demo rates and 50 fake patients)
# into the staging database, from the release running now. Staging only: refuses unless api.env and
# deploy.env both say staging. Running it again updates the demo data in place.
#
# Usage:   deploy/seed-staging.sh
#          It asks for the demo users' password (typed twice, never shown or stored). Every demo user
#          (admin, md, accounts, billing, cashier, reception, doctor, nurse, ...) gets it; admin,
#          accounts and superadmin set up two-factor at their first sign-in.
# Options: DRY_RUN=1 prints every command instead of running it.
#          SEED_USER_PASSWORD in the environment skips the question (CI rehearsal only).
#          HMS_HOME (default /opt/hms).
# Runbook: docs/runbooks/staging-oracle-cloud.md
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/lib.sh"

repo="$(git -C "$script_dir/.." rev-parse --show-toplevel)"
load_deploy_env
acquire_lock

# Reads one setting from an env file without sourcing it: api.env holds secrets this script never needs.
setting() {
  sed -n "s/^$2=//p" "$1" | tail -n 1 | tr -d '"'"'"'\r'
}

api_env="$HMS_ENV_DIR/api.env"
[[ "$(setting "$api_env" APP_ENV)" == staging ]] || die "api.env does not say APP_ENV=staging: the demo hospital never goes onto production"
[[ "${NEXT_PUBLIC_APP_ENV:-}" == staging ]] || die "deploy.env does not say NEXT_PUBLIC_APP_ENV=staging"

# The running release has its migrations applied, so the seed matches its schema.
tag="$(read_state current)"
[[ -n "$tag" ]] || die "nothing is deployed yet: run deploy/deploy.sh first"
if ! commit="$(git -C "$repo" rev-parse --verify --quiet "refs/tags/$tag^{commit}")"; then
  dry_run || die "tag $tag not found"
  commit="$(git -C "$repo" rev-parse HEAD)"
  log "dry run: tag $tag not found locally, using HEAD $commit"
fi

if [[ -z "${SEED_USER_PASSWORD:-}" ]]; then
  read -r -s -p "Password for every demo user (12 or more characters): " first
  echo >&2
  read -r -s -p "Type it again: " second
  echo >&2
  [[ "$first" == "$second" ]] || die "the two passwords differ"
  SEED_USER_PASSWORD="$first"
  unset first second
fi
[[ "${#SEED_USER_PASSWORD}" -ge 12 ]] || die "use a password of 12 or more characters: staging is on the internet"
# Passed to the container by name only, so it never appears in the process list or the dry run.
export SEED_USER_PASSWORD

build_dir="$(mktemp -d)"
trap 'rm -rf -- "$build_dir"' EXIT
git -C "$repo" archive "$commit" | tar -x -C "$build_dir"

log "building hms-seed:$tag"
run docker build --quiet --file "$build_dir/deploy/seed.Dockerfile" --tag "hms-seed:$tag" \
  --label "org.opencontainers.image.revision=$commit" \
  --label "org.opencontainers.image.version=$tag" \
  "$build_dir" >/dev/null

# The seed connects as the API's own restricted login (DATABASE_URL) and encrypts the fake Aadhaar
# and ABHA numbers with the API's FIELD_ENCRYPTION_KEY, both from api.env. api.env runs the API with
# NODE_ENV=production, which the seed refuses, so it is overridden for this container alone; the
# seed still refuses APP_ENV=production. No two-factor secret is given: those users set it up.
log "loading the demo hospital into staging"
run docker run --rm --name "hms-seed-$tag" \
  --env-file "$api_env" \
  --env NODE_ENV=development \
  --env SEED_USER_PASSWORD \
  --env SEED_TOTP_SECRET= \
  --cap-drop ALL --security-opt no-new-privileges:true \
  "hms-seed:$tag"
run docker image rm "hms-seed:$tag" >/dev/null
log "demo hospital loaded on staging from $tag"
