# LearnOS production (10.66.66.7:8080)

Files copied to `/home/floatctfadmin/learnos`:

- `docker-compose.yml`: production base (Postgres 5434 loopback, no public web port)
- `docker-compose.prod.yml`: binds web to 127.0.0.1:3000
- `.env.local`: production secrets (not in git)
- `deploy/caddy/Caddyfile`: internal TLS on 10.66.66.7:8080
- `certs/`: internal CA, `learnos.crt`, `learnos.key`
- `db/`: business schema + Better Auth migration

Start:

```bash
cd ~/learnos
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.prod.yml up -d postgres web
docker run -d --name learnos-caddy --network host \
  -v ~/learnos/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v ~/learnos/certs:/certs:ro \
  -v learnos-caddy-data:/data -v learnos-caddy-config:/config \
  caddy:2-alpine
```

Health: `curl -k https://10.66.66.7:8080/api/health`.

## Known blocker

The installed FloatCTF API image (`floatctf/api:1.0.0`) has no OIDC provider
(`/api/oidc/...` 404, no `oidc` section in `floatctf.toml`). LearnOS currently
runs with admin/password login. FloatCTF SSO requires upgrading the FloatCTF
API to the OIDC build and registering the callback
`https://10.66.66.7:8080/api/auth/callback/floatctf` before setting
`FLOATCTF_OIDC_*`.

## FloatCTF OIDC production (2026-10-24)

- FloatCTF API upgraded to an OIDC build layered on `floatctf/api:1.0.0`.
- OIDC issuer: `https://10.66.66.7:8443` (Caddy internal TLS, 10.66.66.7 only).
- Signing key: `/home/floatctfadmin/learnos/oidc/prod-oidc-1.pem` (0600/readable by container group).
- OIDC migration `20261023162115-oidc-provider.sql` applied.
- Client `learnos` active, redirect `https://10.66.66.7:8080/api/auth/callback/floatctf`.
- Old API preserved as `floatctf-api-1.0.0-backup` (stopped).
- Temporary test user was deleted after verifying SSO.
- Full SSO verified: FloatCTF login → consent → LearnOS `/courses`.

Note: the running API container was switched manually because the installed
FloatCTF compose file is root-owned and not editable by `floatctfadmin`.
Review/update the upstream FloatCTF deployment so this image survives future
`docker compose up` / upgrades.

## 2026-10-24 HTTPS + dual host

- FloatCTF main: `https://120.95.81.151/` and `https://10.66.66.7/`
- OIDC issuer: `https://120.95.81.151` (same origin as production main)
- LearnOS production: `https://120.95.81.151:8080`
- LearnOS dev: `https://10.66.66.7:8080` (admin/password only; no SSO)
- HTTP 80 on both IPs redirects to HTTPS.
- Dual-SAN cert: `/home/floatctfadmin/learnos/certs/floatctf.crt`.
- Combined Caddy runs on host network; config: `deploy/prod/floatctf-Caddyfile`.
- `floatctf-caddy` container was replaced manually because the installed Caddyfile is root-owned. Old Caddy config remains under `/var/lib/floatctf/config/caddy`.
- Dev SSO is intentionally hidden because the single OIDC issuer is 120 and the dev VPN cannot reach 120.

Production SSO was verified with a temporary FloatCTF user:
login → consent → `https://120.95.81.151:8080/courses`; test user deleted.
