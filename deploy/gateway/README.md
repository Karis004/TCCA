# Shared HTTPS gateway

This separate Compose project owns the server's public HTTP/HTTPS entry point.
Its configuration is versioned with TCCA, but stopping or recreating the gateway
does not stop the application. The same Caddy instance can serve additional sites.

## Request and certificate flow

`https://tcca.duckdns.org` -> Oracle public IP -> primary interface TCP 443 ->
Caddy -> `tcca:3000` on the existing `tcca_default` Docker network.

Caddy obtains certificates from Let's Encrypt, renews them automatically, and
redirects this hostname's HTTP requests on port 80 to HTTPS. It publishes no
administration port. TCP is sufficient for HTTPS; this deployment does not publish
UDP 443 for HTTP/3.

Certificates, private keys, ACME account state and Caddy state are bind-mounted
from `/var/lib/personal-gateway/data` and `/var/lib/personal-gateway/config`.
Keep these directories private, persistent and backed up. They are outside the
repository and application Docker build context. A gateway restart/recreation
reuses them; no separate Certbot or cron renewal script is needed.

## Tailscale coexistence

OCI's public IP `40.233.65.88` maps to primary private IPv4 `10.0.0.199`.
The Compose publications explicitly bind `10.0.0.199:80` and `10.0.0.199:443`.
Tailscale Serve keeps its existing tailnet-only `100.77.107.46:443` and private
IPv6 listeners. Do not change these publications to wildcard `80:80` / `443:443`
without checking conflicts and unintended exposure. Recheck addresses if the
server's network configuration changes.

## Deploy from the server checkout

Back up production configuration and database before changing deployment.
The primary TCCA Compose stack and `tcca_default` network must already exist.
DNS A must point to the server; any published AAAA must also reach it. Oracle
ingress and the host firewall must permit TCP 80 and 443 for the primary interface.

```sh
cd /home/ubuntu/TCCA
git pull --ff-only origin main
cd deploy/gateway
cp .env.example .env  # first deployment only; preserve an existing .env
sudo install -d -m 700 /var/lib/personal-gateway/data /var/lib/personal-gateway/config
docker compose config --quiet
docker compose pull caddy
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d --wait --wait-timeout 120 caddy
docker compose logs --tail=100 caddy
curl -I https://tcca.duckdns.org/
```

A container health check only confirms that Caddy's local administration API is
running. Verify public HTTPS separately, with normal certificate verification.

For route-only updates:

```sh
docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Existing HTTP entry and browser settings

The original application Compose file still publishes HTTP `8084:3000` during
the transition. It is not protected by adding HTTPS elsewhere. Use the new HTTPS
URL for normal access; retire the old public mapping after settings migration.

MongoDB transactions and transaction presets are shared by the old and new
entry points. Browser-local settings are not: scheme, hostname and port define
different origins. The current application uses `ai-ledger-model-lists` and the
legacy `ai-ledger-custom-lists` localStorage keys for category/payment-method
settings. Export or record these in each browser/device before abandoning its
old origin. Do not clear site data to troubleshoot the switch.

If an old hostname was deleted from DuckDNS, the browser may still retain its
storage; restoring access to that same hostname may be required to export it.
The new site's default categories do not imply that database transactions were
lost. Future OAuth callback URLs must use the new hostname, for example
`https://tcca.duckdns.org/api/auth/callback/google`, once login is implemented.

## Add another site

1. Assign an available domain name to the same public IP.
2. Add that application's existing Docker network as another external network in
   this Compose file, and attach Caddy to it. Use unique upstream container names.
3. Add a hostname block in `caddy/Caddyfile` pointing to its internal service/port.
4. Validate, update/recreate the gateway for network changes, then verify HTTPS.

Keep the certificate directories when adding sites or recreating the gateway.
Only configured hostnames are routed; pointing arbitrary DNS names at this IP
does not automatically expose another application.

## Roll back the gateway

`docker compose down` in this directory stops only the gateway project. Keep its
host state directories. The independent TCCA container and existing HTTP 8084
entry remain running. Review the backed-up Git revision/configuration before
reapplying an older gateway version.
