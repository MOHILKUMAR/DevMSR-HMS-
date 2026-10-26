# Staging on Oracle Cloud, step by step

From nothing to signing in to staging with the fake demo hospital. Staging is a copy of production with fake data only: hospital staff try a normal day on it, and the security audit (VAPT) runs against it. Never put a real patient on it.

Staging can also run on Render's free plan, with no server to look after: [staging-render.md](staging-render.md). This guide gives the order and the Oracle and staging specifics, and links to the other runbooks for the rest. Claude Code wrote and tested the scripts, but nothing here has been run on a real server or account: the first run is the developer's. Allow half a day.

## What staging uses

| Piece | Choice | Cost |
| --- | --- | --- |
| Server | Oracle Cloud Always Free, Ampere A1 (ARM), Ubuntu 24.04, Mumbai | Free. Oracle asks for a card to verify the account |
| Database | Supabase free plan, Mumbai, its own project | Free. A free project pauses after a week without use |
| DNS, TLS, proxy | Cloudflare free plan | Free |
| Domain | A separate domain only for staging | About Rs 700 to 1,000 a year, bought by the developer |
| Backups | Optional on staging at first (only fake data). Cloudflare R2 when wanted | R2 has a free allowance, but Cloudflare asks for a payment method first |

### Why a separate domain

Staging and production must never share a domain:

- Session cookies are set for the parent domain (`COOKIE_DOMAIN`), so `app.staging.example.in` and `app.example.in` would send each other their sign-in cookies.
- Cloudflare's free certificate covers one level of subdomain (`*.example.in`), not `app.staging.example.in`.

So staging gets its own domain, for example `myhospital-staging.in`, with `app.` and `api.` under it. In this guide it is written `<staging-domain>`.

## 1. The domain and Cloudflare

1. Buy `<staging-domain>` at any registrar.
2. Add it to Cloudflare (free plan) and change the registrar's name servers to the two Cloudflare gives.
3. Wait until Cloudflare shows the domain as active. DNS records come in step 9, once the server has its address.

## 2. The Oracle Cloud account

1. Sign up for Oracle Cloud Free Tier.
2. **Home region: India West (Mumbai).** It cannot be changed later, and Always Free resources exist only in the home region. India South (Hyderabad) is the other Indian region if Mumbai is not offered.
3. Turn on two-factor sign-in for the Oracle console (profile, security).

## 3. The network

1. Networking, Virtual cloud networks, **Start VCN Wizard**, "Create VCN with Internet Connectivity". Name it `hms-staging`. Keep the defaults.
2. Open the public subnet's **security list** and replace its ingress rules:
   - TCP 22 from your own public address only (`x.x.x.x/32`). Delete the default rule that allows 22 from `0.0.0.0/0`.
   - TCP 80 and TCP 443 from each Cloudflare IPv4 range in `deploy/caddy/cloudflare-ips.caddy`: one rule per range and port. It is tedious, but only done once.
   - Keep the ICMP rules the wizard made. Nothing else inbound. Egress stays open.

   This is the first firewall layer. The host firewall in step 6 enforces the same list again ([server-hardening.md](server-hardening.md), section 1).

## 4. The server

1. Compute, Instances, **Create instance**, named `hms-staging`.
2. Image: **Canonical Ubuntu 24.04** (the aarch64 build).
3. Shape: **VM.Standard.A1.Flex** (Ampere, "Always Free eligible"), **2 OCPUs and 12 GB** of memory. Building the web app needs a few GB; 12 GB leaves room.
4. Networking: the `hms-staging` VCN and its public subnet, with a public IPv4 address.
5. SSH key: paste the **public** half of an Ed25519 key you made on your machine (`ssh-keygen -t ed25519`, with a passphrase).
6. Boot volume: 100 GB. The free allowance is 200 GB in total.
7. Create. If Oracle says **out of capacity** for A1, try again later or pick another availability domain. Do not fall back to the tiny E2.1.Micro shape: with 1 GB of memory it cannot build the app.

ARM is fine: the deploy builds every image on the server itself, and the Node, Caddy and PostgreSQL base images support ARM.

## 5. A fixed address

The instance's first public address changes if the instance is recreated. Give it one that stays:

1. Networking, IP management, Reserved public IPs: reserve one in the same compartment.
2. On the instance's primary VNIC, IPv4 addresses: remove the ephemeral public IP, then assign the reserved one.
3. Note the address: Cloudflare's DNS points at it (step 9), and Supabase allows only it (step 8).

## 6. First sign-in and hardening

```bash
ssh ubuntu@<reserved-ip>
```

**Oracle's own firewall rules come first.** Oracle's Ubuntu images ship iptables rules (`/etc/iptables/rules.v4`, loaded at boot by `netfilter-persistent`) that reject everything except SSH, and they fight with ufw and Docker. Remove them before hardening:

```bash
sudo apt-get purge --yes iptables-persistent netfilter-persistent
sudo reboot
```

Sign in again. `sudo iptables -S INPUT` should now show only the default `ACCEPT` policy; the security list still guards the server until the next steps. Then follow [server-hardening.md](server-hardening.md) from section 2 to the end, in order:
- the `hmsadmin` user and SSH by key only
- the UTC clock with Indian time servers
- automatic security updates
- `deploy/server/setup-firewall.sh` with your address, for ufw and the Cloudflare-only rules in `DOCKER-USER`
- Docker's settings

On Oracle the network interface is usually `enp0s6`: check with `ip -brief link` and pass it as `EXT_IF`.

After hardening, sign in as `hmsadmin`, not `ubuntu`.

## 7. Docker and the code

Follow [deploy-and-rollback.md](deploy-and-rollback.md), "First-time setup", steps 2 and 3:

1. Docker Engine and the Compose plugin from Docker's apt repository, which has ARM packages. Then `deploy/server/docker-daemon.json`.
2. `/opt/hms` and the clone. The repository is private, so give the server a **read-only deploy key**:
   - On the server, run `ssh-keygen -t ed25519 -f ~/.ssh/github-deploy` (no passphrase, used by scripts).
   - In GitHub, under the repository's Settings, Deploy keys, add the `.pub` file. Leave write access off.
   - Clone with `git clone git@github.com:MOHILKUMAR/DevMSR-HMS-.git /opt/hms/src`, after adding a `Host github.com` entry with `IdentityFile ~/.ssh/github-deploy` to `~/.ssh/config`.

## 8. The staging database

Follow [supabase.md](supabase.md) with a **new project for staging only**, never shared with production:
- Name: `hms-staging`.
- Region: South Asia (Mumbai).
- Network restrictions: allow only the reserved IP from step 5.

Staging uses three database logins, all through the **session pooler** (port 5432 on the pooler host):

| Setting | File | User | Made by |
| --- | --- | --- | --- |
| `DIRECT_URL` | `migrate.env` | `postgres.<project-ref>`, the owner | Supabase |
| `DATABASE_URL` | `api.env` | `hms_app.<project-ref>`, the API's restricted login | `deploy.sh`, on the first deploy |
| `JOBS_DATABASE_URL` | `api.env` | `hms_jobs.<project-ref>`, background jobs only | `deploy.sh`, on the first deploy |

Generate a separate password of 16 or more characters for `hms_app` and for `hms_jobs` (`openssl rand -base64 24`), and put each in its URL. `deploy.sh` creates both logins with those passwords.

The free plan pauses a project after a week without use. If staging stops answering after a quiet week, resume the project in the Supabase dashboard.

## 9. Cloudflare for staging

Follow [cloudflare.md](cloudflare.md) for `<staging-domain>`:

- DNS: `A app` and `A api`, both pointing at the reserved IP, both **proxied** (orange cloud). No other record points at the server.
- TLS **Full (strict)**, HSTS and the other edge settings.
- An origin certificate for `*.<staging-domain>` and `<staging-domain>`, saved as `/opt/hms/certs/origin.pem` and `origin.key`, plus the origin pull CA.
- Leave **Authenticated Origin Pulls** off until step 12 works.

## 10. The settings files

Copy each template and fill it in, as in [deploy-and-rollback.md](deploy-and-rollback.md), "First-time setup", step 4:

```bash
cd /opt/hms/src
for f in deploy api web migrate; do cp deploy/env/$f.env.example /opt/hms/env/$f.env; done
chmod 600 /opt/hms/env/*
```

The staging values (everything else stays as in the template):

| File | Setting | Staging value |
| --- | --- | --- |
| `deploy.env` | `APP_HOST`, `API_HOST` | `app.<staging-domain>`, `api.<staging-domain>` |
| `deploy.env` | `NEXT_PUBLIC_API_URL` | `https://api.<staging-domain>/api/v1` |
| `deploy.env` | `NEXT_PUBLIC_APP_ENV` | `staging` |
| `api.env` | `APP_ENV` | `staging` (keeps the mock payment, SMS, WhatsApp and email adapters, as staging must) |
| `api.env` | `CORS_ORIGINS` | `https://app.<staging-domain>` |
| `api.env` | `COOKIE_DOMAIN` | `.<staging-domain>` |
| `api.env` | `DATABASE_URL`, `JOBS_DATABASE_URL` | From step 8 |
| `api.env` | `SESSION_SECRET`, `FIELD_ENCRYPTION_KEY` | Each from `openssl rand -base64 32`, generated on the server, never the same value, never reused for production |
| `migrate.env` | `DIRECT_URL` | From step 8 |

Keep a copy of `api.env` and `migrate.env` in the second safe place ([secrets-and-rotation.md](secrets-and-rotation.md)). Never paste a secret into a chat, an issue or a commit.

Then prove the database connection keeps UTC, transactions and locks the way the app needs: `deploy/check-database.sh` ([supabase.md](supabase.md), section 5).

## 11. The first release

Releases are tags on `main`. On your own machine, from an up-to-date `main`:

```bash
git tag v0.1.0
```

```bash
git push origin v0.1.0
```

On the server, as `hmsadmin`. `SKIP_BACKUP=1` is only because backups are not set up yet:

```bash
cd /opt/hms/src && SKIP_BACKUP=1 deploy/deploy.sh v0.1.0
```

The first build on the server takes a while. The script:
- applies the migrations
- creates the `hms_app` and `hms_jobs` logins
- syncs the roles
- starts the containers
- checks `https://api.<staging-domain>/api/v1/health` and `https://app.<staging-domain>/login` through Cloudflare

Then run `deploy/sql/supabase-lockdown.sql` in Supabase's SQL editor ([supabase.md](supabase.md), section 2).

## 12. The demo hospital

```bash
cd /opt/hms/src && deploy/seed-staging.sh
```

It asks for one password, typed twice, for every demo user. It loads:
- the demo hospital, staff for every role, wards, beds and demo rates
- 50 fake patients

The script refuses to run unless `api.env` and `deploy.env` both say staging. It connects as the API's own restricted login. Running it again updates the demo data in place.

Sign in at `https://app.<staging-domain>`:
- **Usernames:** `reception`, `doctor`, `nurse`, `billing`, `cashier`, `accounts`, `md`, `admin` (the list is in `prisma/seed-data.ts`).
- **Two-factor:** `admin`, `accounts` and `superadmin` set it up at their first sign-in, with an authenticator app on a phone.

Now turn **Authenticated Origin Pulls** on in Cloudflare ([cloudflare.md](cloudflare.md), section 4) and check the app still loads.

## 13. After the first sign-in

- **Backups, monitoring and logs:** [backup-and-restore.md](backup-and-restore.md), [monitoring.md](monitoring.md), [log-retention.md](log-retention.md). Until `backup.env` exists, every deploy needs `SKIP_BACKUP=1`, and the script warns.
- **Later releases:** tag a new version on `main`, then `deploy/deploy.sh <tag>` ([deploy-and-rollback.md](deploy-and-rollback.md)).
- **Hospital trials:** hospital staff try a normal day on staging (UAT). Enter the hospital's real masters (rates, wards, staff names) only as a rehearsal. Still no real patients.
- **Tests against staging:** the ZAP scan ([zap-scan.md](zap-scan.md)), the load test ([load-test.md](load-test.md)), then the VAPT.

## When something goes wrong

| What you see | Usual cause |
| --- | --- |
| SSH times out | Your address changed: update the security list rule and `setup-firewall.sh`'s `SSH_ALLOW_FROM` |
| "Out of host capacity" when creating the instance | Oracle has no free A1 capacity right now: retry later or in another availability domain |
| Cloudflare error 521 or 522 | The security list or `DOCKER-USER` rules miss a Cloudflare range, or Oracle's iptables rules are still there (step 6) |
| Cloudflare error 525 or 526 | The origin certificate in `/opt/hms/certs/` is missing, unreadable to Caddy (uid 1000), or for another domain |
| Every request fails after turning on origin pulls | `origin-pull-ca.pem` is missing: turn origin pulls off, add the file, redeploy, turn it on again |
| The deploy says the API is unhealthy | `journalctl -t hms-api-1 --since "10 min ago"`. Most often a database URL, the Supabase network restriction, or a paused free project |
| `seed-staging.sh` refuses | It only runs with `APP_ENV=staging` in `api.env` and `NEXT_PUBLIC_APP_ENV=staging` in `deploy.env`, after a deploy |
