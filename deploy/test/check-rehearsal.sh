#!/usr/bin/env bash
# Checks a running rehearsal deploy (CI): recorded state, container hardening, and what Caddy lets
# through. Usage: deploy/test/check-rehearsal.sh <expected current tag> <expected previous tag>
set -euo pipefail

expected_current="${1:?expected current tag}"
expected_previous="${2:?expected previous tag}"
: "${HMS_HOME:?}" "${HEALTH_CHECK_CURL_OPTS:?}"
failures=0
check() {
  local description="$1"
  shift
  if "$@"; then
    echo "PASS $description"
  else
    echo "FAIL $description"
    failures=$((failures + 1))
  fi
}
container() { docker ps --quiet --filter label=com.docker.compose.project=hms --filter "label=com.docker.compose.service=$1"; }
# shellcheck disable=SC2086 # HEALTH_CHECK_CURL_OPTS holds several options
api_curl() { curl --silent --resolve api.hms.test:443:127.0.0.1 --resolve app.hms.test:443:127.0.0.1 $HEALTH_CHECK_CURL_OPTS "$@"; }

check "current release is $expected_current" test "$(cat "$HMS_HOME/state/current")" == "$expected_current"
check "previous release is $expected_previous" test "$(cat "$HMS_HOME/state/previous")" == "$expected_previous"
for service in api web caddy; do
  id="$(container "$service")"
  check "$service is running" test -n "$id"
  if [[ "$service" != caddy ]]; then
    check "$service runs $expected_current" test "$(docker inspect --format '{{.Config.Image}}' "$id")" == "hms-$service:$expected_current"
  fi
  check "$service has a read-only root file system" test "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$id")" == true
  check "$service drops all capabilities" grep -q ALL <<<"$(docker inspect --format '{{.HostConfig.CapDrop}}' "$id")"
  check "$service is not root" test "$(docker exec "$id" id -u)" != 0
done
check "only Caddy publishes ports" test "$(docker ps --filter label=com.docker.compose.project=hms --format '{{.Ports}}' | grep -c '0.0.0.0:')" == 1
check "older release images are kept for rollback" docker image inspect "hms-api:$expected_previous" "hms-web:$expected_previous"

check "API health answers through Caddy" test "$(api_curl --output /dev/null --write-out '%{http_code}' https://api.hms.test/api/v1/health)" == 200
check "web login page answers through Caddy" test "$(api_curl --output /dev/null --write-out '%{http_code}' https://app.hms.test/login)" == 200
headers="$(api_curl --head https://app.hms.test/login)"
check "web sends HSTS" grep -qi '^strict-transport-security:' <<<"$headers"
check "web sends a Content-Security-Policy" grep -qi '^content-security-policy:' <<<"$headers"
check "Caddy hides its Server header" bash -c "! grep -qi '^server:' <<<\"\$1\"" _ "$headers"
# Without Cloudflare's client certificate the TLS handshake must fail (authenticated origin pulls).
no_client_cert="$(curl --silent --output /dev/null --write-out '%{http_code}' --resolve api.hms.test:443:127.0.0.1 \
  --cacert "$HMS_HOME/client/server-ca.pem" https://api.hms.test/api/v1/health || true)"
check "a client without the origin pull certificate is refused (got $no_client_cert)" test "$no_client_cert" == 000
plain="$(curl --silent --output /dev/null --write-out '%{http_code}' --resolve api.hms.test:80:127.0.0.1 http://api.hms.test/api/v1/health || true)"
check "plain HTTP redirects to HTTPS (got $plain)" test "$plain" == 308

[[ "$failures" == 0 ]] || { echo "$failures check(s) failed"; exit 1; }
echo "rehearsal checks passed"
