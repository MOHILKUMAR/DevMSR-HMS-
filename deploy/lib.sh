# shellcheck shell=bash
# Shared helpers for the deploy, rollback and backup scripts. Sourced, never run on its own.
#
# Server layout (docs/runbooks/deploy-and-rollback.md):
#   $HMS_HOME/src        git clone of the repository; the scripts run from here
#   $HMS_HOME/env        deploy.env, api.env, web.env, migrate.env (mode 600, never in git)
#   $HMS_HOME/certs      Cloudflare origin certificate, key and origin pull CA
#   $HMS_HOME/releases   one folder per release tag with its compose file and Caddyfile
#   $HMS_HOME/state      current and previous tag, deploy history, lock file

HMS_HOME="${HMS_HOME:-/opt/hms}"
HMS_ENV_DIR="$HMS_HOME/env"
HMS_RELEASES_DIR="$HMS_HOME/releases"
HMS_STATE_DIR="$HMS_HOME/state"
# Releases whose images and folders are kept for rollback, counting the current one.
KEEP_RELEASES="${KEEP_RELEASES:-3}"
export HMS_HOME

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "error: $*"
  exit 1
}

dry_run() { [[ "${DRY_RUN:-0}" == 1 ]]; }

# Runs a command, or prints it when DRY_RUN=1.
run() {
  if dry_run; then
    printf 'dry run:' >&2
    printf ' %q' "$@" >&2
    printf '\n' >&2
  else
    "$@"
  fi
}

# Loads deploy.env (hosts and build arguments, no secrets) into the environment.
load_deploy_env() {
  local file="$HMS_ENV_DIR/deploy.env"
  [[ -f "$file" ]] || die "missing $file (copy deploy/env/deploy.env.example)"
  set -a
  # shellcheck source=/dev/null
  source "$file"
  set +a
  : "${APP_HOST:?APP_HOST missing in deploy.env}" "${API_HOST:?API_HOST missing in deploy.env}"
  local name
  for name in api web migrate; do
    [[ -f "$HMS_ENV_DIR/$name.env" ]] || die "missing $HMS_ENV_DIR/$name.env (copy deploy/env/$name.env.example)"
  done
}

# One deploy or rollback at a time.
acquire_lock() {
  mkdir -p "$HMS_STATE_DIR"
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$HMS_STATE_DIR/deploy.lock"
    flock -n 9 || die "another deploy or rollback is running"
  fi
}

read_state() {
  local file="$HMS_STATE_DIR/$1"
  if [[ -f "$file" ]]; then cat "$file"; fi
}

write_state() {
  if dry_run; then
    log "dry run: would set $1=$2"
  else
    printf '%s\n' "$2" >"$HMS_STATE_DIR/$1"
  fi
}

record_history() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 $2 ${3:-} by=${SUDO_USER:-${USER:-unknown}}"
  if dry_run; then
    log "dry run: would record: $line"
  else
    printf '%s\n' "$line" >>"$HMS_STATE_DIR/history.log"
  fi
}

compose() {
  local tag="$1"
  shift
  HMS_TAG="$tag" run docker compose \
    --project-name hms \
    --file "$HMS_RELEASES_DIR/$tag/compose.prod.yml" \
    --env-file "$HMS_ENV_DIR/deploy.env" \
    "$@"
}

# Checks the public URLs through Cloudflare, so DNS, TLS, Caddy and both apps are all exercised.
# HEALTH_CHECK_RESOLVE=127.0.0.1 and HEALTH_CHECK_CURL_OPTS (client certificate, CA) let the CI
# rehearsal check through Caddy without Cloudflare.
public_check() {
  local url status attempt
  local -a curl_opts=(--silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 10)
  # shellcheck disable=SC2206 # word splitting is intended for extra curl options
  [[ -n "${HEALTH_CHECK_CURL_OPTS:-}" ]] && curl_opts+=(${HEALTH_CHECK_CURL_OPTS})
  for url in "https://$API_HOST/api/v1/health" "https://$APP_HOST/login"; do
    if dry_run; then
      log "dry run: would check $url"
      continue
    fi
    local -a resolve=()
    if [[ -n "${HEALTH_CHECK_RESOLVE:-}" ]]; then
      local host="${url#https://}"
      resolve=(--resolve "${host%%/*}:443:$HEALTH_CHECK_RESOLVE")
    fi
    status=000
    for attempt in 1 2 3 4 5 6 7 8 9 10; do
      status="$(curl "${curl_opts[@]}" "${resolve[@]}" "$url" || true)"
      [[ "$status" == 200 ]] && break
      log "waiting for $url (attempt $attempt, status $status)"
      sleep 6
    done
    [[ "$status" == 200 ]] || {
      log "health check failed: $url returned $status"
      return 1
    }
    log "ok: $url"
  done
}

# Starts a release that is already built and checks it. Returns non-zero if it is unhealthy.
activate_release() {
  local tag="$1"
  [[ -f "$HMS_RELEASES_DIR/$tag/compose.prod.yml" ]] || dry_run || die "release folder for $tag is missing"
  log "starting $tag"
  compose "$tag" up --detach --wait --wait-timeout 180 --remove-orphans || return 1
  public_check
}

# Keeps the images and release folders of the newest KEEP_RELEASES tags (plus current and previous).
prune_releases() {
  local -a keep
  mapfile -t keep < <(
    {
      read_state current
      read_state previous
      if [[ -f "$HMS_STATE_DIR/history.log" ]]; then
        # Lines are "time action tag [commit] by=user". A failed deploy is never worth keeping.
        awk '$2 != "deploy-failed" { print $3 }' "$HMS_STATE_DIR/history.log" | tac | awk 'NF && !seen[$0]++' | head -n "$KEEP_RELEASES"
      fi
    } | awk 'NF && !seen[$0]++'
  )
  log "keeping releases: ${keep[*]:-none}"
  if dry_run; then
    log "dry run: would remove other hms images and release folders"
    return 0
  fi
  local ref tag dir
  while read -r ref; do
    tag="${ref##*:}"
    if [[ " ${keep[*]} " != *" $tag "* ]]; then
      docker image rm "$ref" >/dev/null && log "removed image $ref"
    fi
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' | grep -E '^hms-(api|web|migrate):' || true)
  for dir in "$HMS_RELEASES_DIR"/*/; do
    [[ -d "$dir" ]] || continue
    tag="$(basename "$dir")"
    if [[ " ${keep[*]} " != *" $tag "* ]]; then
      rm -rf -- "$dir" && log "removed release folder $tag"
    fi
  done
  docker image prune --force >/dev/null
}
