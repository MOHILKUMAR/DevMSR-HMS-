#!/usr/bin/env bash
# Builds a throwaway $HMS_HOME for the deploy rehearsal (CI and local dry runs): env files with fresh
# random secrets, a test origin certificate for app.hms.test and api.hms.test, and a stand-in for
# Cloudflare's origin pull CA with a client certificate that curl presents.
# Never use its output on a real server.
#
# Usage: deploy/test/make-rehearsal-home.sh <dir>
#        REHEARSAL_DATABASE_URL sets the database the containers use (default: a placeholder).
set -euo pipefail

home="${1:?usage: make-rehearsal-home.sh <dir>}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
database_url="${REHEARSAL_DATABASE_URL:-postgresql://hms:unused@db.invalid:5432/hms_infra}"
# Git Bash would turn "/CN=..." into a Windows path. No effect elsewhere.
export MSYS2_ARG_CONV_EXCL="/CN="

mkdir -p "$home"/{env,certs,client,releases,state}
secret() { openssl rand -base64 32; }

sed -e 's/^APP_HOST=.*/APP_HOST=app.hms.test/' \
  -e 's/^API_HOST=.*/API_HOST=api.hms.test/' \
  -e 's#^NEXT_PUBLIC_API_URL=.*#NEXT_PUBLIC_API_URL=https://api.hms.test/api/v1#' \
  "$repo/deploy/env/deploy.env.example" >"$home/env/deploy.env"
sed -e "s#^DATABASE_URL=.*#DATABASE_URL=$database_url#" \
  -e "s#^SESSION_SECRET=.*#SESSION_SECRET=$(secret)#" \
  -e "s#^FIELD_ENCRYPTION_KEY=.*#FIELD_ENCRYPTION_KEY=$(secret)#" \
  -e 's#^CORS_ORIGINS=.*#CORS_ORIGINS=https://app.hms.test#' \
  -e 's#^COOKIE_DOMAIN=.*#COOKIE_DOMAIN=.hms.test#' \
  "$repo/deploy/env/api.env.example" >"$home/env/api.env"
cp "$repo/deploy/env/web.env.example" "$home/env/web.env"
sed -e "s#^DIRECT_URL=.*#DIRECT_URL=$database_url#" "$repo/deploy/env/migrate.env.example" >"$home/env/migrate.env"
chmod 600 "$home"/env/*.env

cd "$home/certs"
quiet() { "$@" >/dev/null 2>&1; }
# The certificate Caddy serves, signed by a test CA that curl trusts with --cacert.
quiet openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=hms-rehearsal-server-ca \
  -keyout "$home/client/server-ca.key" -out "$home/client/server-ca.pem"
quiet openssl req -newkey rsa:2048 -nodes -subj /CN=hms.test -keyout origin.key -out origin.csr
printf 'subjectAltName=DNS:app.hms.test,DNS:api.hms.test\nextendedKeyUsage=serverAuth\n' >server.ext
quiet openssl x509 -req -in origin.csr -days 2 -CA "$home/client/server-ca.pem" \
  -CAkey "$home/client/server-ca.key" -CAcreateserial -extfile server.ext -out origin.pem
# Stand-in for Cloudflare's origin pull CA, and the client certificate Cloudflare would present.
quiet openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=hms-rehearsal-origin-pull-ca \
  -keyout "$home/client/origin-pull-ca.key" -out origin-pull-ca.pem
quiet openssl req -newkey rsa:2048 -nodes -subj /CN=hms-rehearsal-edge \
  -keyout "$home/client/client.key" -out "$home/client/client.csr"
printf 'extendedKeyUsage=clientAuth\n' >client.ext
quiet openssl x509 -req -in "$home/client/client.csr" -days 2 -CA origin-pull-ca.pem \
  -CAkey "$home/client/origin-pull-ca.key" -CAcreateserial -extfile client.ext -out "$home/client/client.pem"
rm -f origin.csr server.ext client.ext ./*.srl "$home"/client/*.srl "$home"/client/*.csr
# Caddy runs as uid 1000. On a real server only the key's group is 1000 (docs/runbooks/cloudflare.md).
chmod 644 origin.pem origin.key origin-pull-ca.pem

echo "HEALTH_CHECK_CURL_OPTS=--cacert $home/client/server-ca.pem --cert $home/client/client.pem --key $home/client/client.key"
