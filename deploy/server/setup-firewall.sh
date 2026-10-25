#!/usr/bin/env bash
# Host firewall for the HMS server (docs/runbooks/server-hardening.md):
#   - SSH only from the addresses in SSH_ALLOW_FROM;
#   - ports 80 and 443 only from Cloudflare, read from deploy/caddy/cloudflare-ips.caddy;
#   - everything else inbound dropped.
# Docker writes its own iptables rules for published ports and bypasses ufw's input rules, so the
# web ports are filtered in the DOCKER-USER chain, which Docker always consults first.
# The cloud provider's network firewall (Oracle security list) should allow the same and no more.
#
# Usage:   sudo SSH_ALLOW_FROM="203.0.113.7/32 198.51.100.0/24" deploy/server/setup-firewall.sh
# Options: DRY_RUN=1 prints the commands and the DOCKER-USER block instead of applying them.
#          EXT_IF (default: the interface of the default route).
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib.sh
source "$script_dir/../lib.sh"

: "${SSH_ALLOW_FROM:?set SSH_ALLOW_FROM to the developer addresses allowed to use SSH}"
ext_if="${EXT_IF:-$(ip -o -4 route show to default 2>/dev/null | awk '{ print $5; exit }')}"
[[ -n "$ext_if" ]] || die "could not find the external interface; set EXT_IF"
dry_run || [[ "$(id -u)" == 0 ]] || die "run as root (sudo)"

mapfile -t cloudflare_v4 < <(grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}' "$script_dir/../caddy/cloudflare-ips.caddy")
[[ "${#cloudflare_v4[@]}" -ge 10 ]] || die "Cloudflare ranges not found in deploy/caddy/cloudflare-ips.caddy"

# 1. ufw: the host's own ports (SSH). Docker-published ports are handled in step 2.
run ufw --force reset
run ufw default deny incoming
run ufw default allow outgoing
run ufw default deny routed
for source in $SSH_ALLOW_FROM; do
  run ufw allow proto tcp from "$source" to any port 22 comment 'SSH from developer'
done

# 2. DOCKER-USER: traffic to containers. Replies and container-to-container traffic pass; new
#    connections from outside reach only 80 and 443, and only from Cloudflare.
block="# BEGIN HMS DOCKER-USER (deploy/server/setup-firewall.sh)
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER ! -i $ext_if -j RETURN"
for range in "${cloudflare_v4[@]}"; do
  block+="
-A DOCKER-USER -i $ext_if -s $range -p tcp -m multiport --dports 80,443 -j RETURN"
done
block+="
-A DOCKER-USER -i $ext_if -j DROP
COMMIT
# END HMS DOCKER-USER"

after_rules=/etc/ufw/after.rules
if dry_run; then
  log "dry run: would replace the HMS block in $after_rules with:"
  printf '%s\n' "$block" >&2
else
  # Replace an earlier copy of the block, so the script can be run again after the ranges change.
  sed -i '/^# BEGIN HMS DOCKER-USER/,/^# END HMS DOCKER-USER/d' "$after_rules"
  printf '%s\n' "$block" >>"$after_rules"
fi

run ufw --force enable
run ufw reload
log "firewall set: SSH from $SSH_ALLOW_FROM; 80 and 443 from ${#cloudflare_v4[@]} Cloudflare ranges on $ext_if"
log "check from outside: a direct request to the server's IP on 443 must time out"
