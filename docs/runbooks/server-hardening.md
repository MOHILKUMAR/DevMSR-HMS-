# Server hardening

For the staging VM (Oracle Cloud) and the production server. Written for Ubuntu Server 24.04 LTS. Files: `deploy/server/`. Do these steps before the first deploy, in this order, with a second SSH session kept open until each change is proven.

## 1. The cloud firewall

In the provider's console (Oracle Cloud: the subnet's security list or a network security group):

- TCP 22 only from the developer's address or addresses.
- TCP 80 and 443 only from Cloudflare's ranges (`deploy/caddy/cloudflare-ips.caddy`).
- Nothing else inbound. Outbound open (Supabase, R2, Sentry, Resend, apt, Docker Hub).

This is the first layer. The host firewall in step 5 is the second, so one mistake does not expose the server.

## 2. Users and SSH

```bash
sudo adduser --disabled-password --gecos "" hmsadmin
sudo usermod -aG sudo,docker hmsadmin        # docker group after Docker is installed
sudo mkdir -p /home/hmsadmin/.ssh && sudo cp ~/.ssh/authorized_keys /home/hmsadmin/.ssh/
sudo chown -R hmsadmin:hmsadmin /home/hmsadmin/.ssh && sudo chmod 700 /home/hmsadmin/.ssh
sudo passwd hmsadmin                          # a long password, for sudo only; SSH never accepts it
```

Use an Ed25519 key with a passphrase on the developer's machine (`ssh-keygen -t ed25519`). Then:

```bash
sudo cp deploy/server/sshd-hms.conf /etc/ssh/sshd_config.d/10-hms.conf
sudo sshd -t && sudo systemctl reload ssh
```

From a new terminal, check `ssh hmsadmin@server` works and `ssh -o PubkeyAuthentication=no hmsadmin@server` is refused. Only then close the old session.

Membership of the `docker` group is root-equivalent. Only `hmsadmin` has it.

## 3. Time: UTC clock, synced to Indian time servers

```bash
sudo timedatectl set-timezone UTC
sudo apt-get install --yes chrony
sudo cp deploy/server/chrony-india.conf /etc/chrony/sources.d/india.sources
# Comment out the "pool" lines in /etc/chrony/chrony.conf, then:
sudo systemctl restart chrony
chronyc sources -v          # the NIC and NPL servers show as reachable, one marked *
chronyc tracking            # System time offset well under a second
```

The server clock stays in UTC; the app shows IST. CERT-In's April 2022 directions ask for clocks synced to NIC or NPL time servers (or servers traceable to them), because log times must line up during an incident. Confirm the server list with the VAPT auditor. If the provider blocks outbound NTP, record that and use its time service while asking.

## 4. Automatic security updates

```bash
sudo apt-get install --yes unattended-upgrades
sudo cp deploy/server/20auto-upgrades /etc/apt/apt.conf.d/20auto-upgrades
sudo cp deploy/server/52unattended-upgrades-hms /etc/apt/apt.conf.d/52unattended-upgrades-hms
sudo unattended-upgrade --dry-run --debug | tail -n 20
```

The server reboots itself at 03:30 IST only when an update needs it, which takes the app away for about two minutes. If the hospital prefers to schedule reboots, set `Automatic-Reboot` to `false` and check `/var/run/reboot-required` every week instead.

## 5. Host firewall

```bash
sudo SSH_ALLOW_FROM="203.0.113.7/32" deploy/server/setup-firewall.sh
```

It sets ufw to drop everything inbound except SSH from the listed addresses, and adds rules to Docker's `DOCKER-USER` chain so ports 80 and 443 accept only Cloudflare. Docker's own rules skip ufw's input rules for published ports, which is why the web ports are filtered there. Run it again after Cloudflare's ranges change. Preview with `DRY_RUN=1`.

Check from a machine outside Cloudflare: `curl -m 5 https://<server-ip>` must time out, and `nmap -Pn <server-ip>` must show only 22 (from an allowed address).

## 6. Docker

- Install Docker Engine and the Compose plugin from Docker's apt repository, not the Ubuntu `docker.io` package.
- `/etc/docker/daemon.json` from `deploy/server/docker-daemon.json`: logs to journald, `no-new-privileges` for every container, no inter-container traffic on the default bridge, and `live-restore` so a Docker upgrade does not stop the app.
- Containers run read-only as non-root users with all capabilities dropped (`deploy/compose.prod.yml`). Only Caddy publishes ports.

## 7. Small things

- `sudo apt-get purge --yes snapd` if nothing uses it, and remove any other service listening on a port (`sudo ss -tulpn`).
- Swap of 2 GB on a small VM, so a build does not kill the running app.
- Disk alerts: [monitoring.md](monitoring.md).

## Checklist

- [ ] Cloud firewall: 22 from the developer, 80 and 443 from Cloudflare only
- [ ] SSH key only, root login off, password login refused (tested)
- [ ] Clock in UTC, synced to NIC or NPL, confirmed with the auditor
- [ ] Unattended security upgrades on, reboot policy agreed with the hospital
- [ ] ufw and DOCKER-USER rules in place, a direct request to the IP times out
- [ ] Docker from Docker's repository, `daemon.json` in place
