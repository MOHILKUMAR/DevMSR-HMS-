# Cloudflare

Cloudflare sits in front of both host names: DNS, proxy, TLS to the browser, and the first line against floods. The server accepts web traffic only from Cloudflare, and only with Cloudflare's client certificate. Files: `deploy/Caddyfile`, `deploy/caddy/cloudflare-ips.caddy`.

## 1. DNS

| Record | Name | Value | Proxy |
| --- | --- | --- | --- |
| A | `app` | server's public IPv4 | Proxied (orange cloud) |
| A | `api` | server's public IPv4 | Proxied |

For staging use separate names, for example `app.staging` and `api.staging`, or a separate domain. No AAAA records: Caddy is published on IPv4 only. No other record may point at the server's IP, because a grey-cloud record would reveal it.

## 2. TLS

- SSL/TLS mode: **Full (strict)**.
- Edge certificates: **Always Use HTTPS** on, **Minimum TLS version 1.2**, **TLS 1.3** on, **Automatic HTTPS Rewrites** on.
- **HSTS** on: max-age 12 months, include subdomains, no preload until every subdomain of the domain is HTTPS for good. The app and API also send HSTS themselves.

## 3. Origin certificate (Cloudflare to Caddy)

1. SSL/TLS, Origin Server, Create certificate: RSA 2048 or ECDSA, host names `app.<domain>` and `api.<domain>` (or `*.<domain>`), validity 15 years.
2. Save the certificate as `/opt/hms/certs/origin.pem` and the private key as `/opt/hms/certs/origin.key`. The key is shown once.
3. Caddy runs as uid 1000:

   ```bash
   sudo chown root:1000 /opt/hms/certs/origin.key && sudo chmod 640 /opt/hms/certs/origin.key
   sudo chmod 644 /opt/hms/certs/origin.pem
   ```

4. Keep a copy of the key in the second safe place ([secrets-and-rotation.md](secrets-and-rotation.md)).

## 4. Authenticated origin pulls (Cloudflare proves itself to Caddy)

The Caddyfile requires a client certificate signed by Cloudflare's origin pull CA, so a request that reaches the server without going through Cloudflare fails at the TLS handshake, even if a firewall rule is wrong.

1. Download Cloudflare's origin pull CA certificate (Cloudflare docs, "Authenticated Origin Pulls", zone-level) to `/opt/hms/certs/origin-pull-ca.pem`, mode 644.
2. SSL/TLS, Origin Server: turn **Authenticated Origin Pulls** on, after the first deploy works with it in place. If it is off while Caddy requires it, every request fails with a 52x error.

The zone-level certificate is shared by all Cloudflare customers, so this proves the request came through Cloudflare, not through this zone. The firewall rules and the IP ranges below close the rest.

## 5. Real client IPs

Caddy trusts `CF-Connecting-IP` and `X-Forwarded-For` only from Cloudflare's ranges (`deploy/caddy/cloudflare-ips.caddy`), and the API trusts two proxy hops (`TRUST_PROXY=2`: Cloudflare, then Caddy). Rate limits and login records then use the real client address.

Every quarter, compare the snippet with <https://www.cloudflare.com/ips-v4> and <https://www.cloudflare.com/ips-v6>. If they differ, update the snippet in a pull request, deploy, and run `deploy/server/setup-firewall.sh` again, since it reads the same file.

## 6. Security settings

- Security level: medium. Bot Fight Mode: off for `api.` if it ever blocks the web app's own calls; test on staging first.
- WAF: the free managed rules on. Add a rate limiting rule for `api.<domain>/api/v1/auth/login` (for example 20 requests per minute per IP) as a coarse first layer; the API's own per-user limits stay the real control.
- Caching: the default (no HTML or API caching). Add a cache rule that bypasses cache for `api.<domain>/*`, so no response with patient data is ever cached at the edge.
- Turn off anything that rewrites pages: Rocket Loader, Mirage, email obfuscation, Zaraz. They break the Content-Security-Policy.

## 7. Check

```bash
curl -sI https://app.<domain>/login | grep -i -E 'strict-transport|content-security|server'
curl -s https://api.<domain>/api/v1/health
curl -m 5 -k https://<server-ip>/              # must time out or fail the TLS handshake
```

## Checklist

- [ ] A records for `app` and `api`, proxied; no other record points at the server
- [ ] Full (strict), Always Use HTTPS, TLS 1.2 minimum, HSTS
- [ ] Origin certificate and key in `/opt/hms/certs`, key copied to the second safe place
- [ ] Authenticated origin pulls on, CA file in place
- [ ] Cache bypass for the API, page rewriting features off
- [ ] Quarterly IP range check in the calendar
