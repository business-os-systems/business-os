# Platform deployment helpers

These scripts run against the deployment database as the owner/migration identity. They are not part of the application runtime.

## Provision runtime credentials

1. Copy `.env.example` to a deployment-only `.env` and set `DATABASE_URL`, `APP_PLATFORM_DB_PASSWORD`, `APP_TENANT_DB_PASSWORD`, the three host values (`DOMAIN_ROOT`, `MARKETING_HOST`, `OPERATOR_HOST`) and `TENANT_TLS_DIR`. `preflight.sh` rejects the deploy when any of them is missing.
2. Export the file and run:

   ```bash
   set -a
   . ./deploy/platform/.env
   set +a
   ./deploy/platform/provision-roles.sh
   ```

The script sets both role passwords and checks the Platform boundary:

- `app_tenant` has no `USAGE` on `platform`.
- `app_platform` has `USAGE` on `platform` and can select `platform.operators`.
- `app_tenant` can select `reference.v_active_catalog_values`.
- `app_tenant` can execute only `public.fn_assert_quota_available` for quota enforcement; it cannot read `platform.quotas`.
- `app_platform` can read `platform.v_app_installation_counts` and has no direct grant on `public.installed_apps`.
- `app_tenant` has `USAGE` on `cms` and per-table grants only; it cannot read `platform.operators` or `platform.audit_events`.
- no `cms_*` table remains in `public`, and no foreign key from `cms` points at another schema.

## Verify migrations

After a deploy:

```bash
set -a
. ./deploy/platform/.env
set +a
./deploy/platform/verify-migrations.sh
```

It fails if a Platform migration is missing, if `app_platform` cannot reach the Platform schema, if the audit actor FK is not `ON DELETE RESTRICT` (D-027), if the tenant identity cannot execute the quota gate, or if either identity crosses the quota/catalog grant boundary.

## Seed reference catalogs

The ten reference catalogs are seeded by an insert-only, idempotent command. It creates missing catalog rows and missing `(catalogKey, code)` values; it never updates an existing value, so operator edits and retirements survive a re-run, and it never deletes.

```bash
set -a
. ./deploy/platform/.env
set +a
pnpm --filter @suite/db db:seed:catalogs
```

The approved launch content lives in `packages/db/src/reference-catalog-seed-data.ts`. Run the command as the owner/migration identity. It is not a `prisma db seed` reset and it does not touch tenant or platform data. Re-running it against a shared database requires explicit human approval (Human Seeding Gate).

## Build and run the stack

The stack runs four applications plus PostgreSQL, Redis and Caddy. Every
application service in the compose file names the image the deploy workflow
publishes and carries the same build definition, so the CI path and a local
build produce one image:

| Service     | Dockerfile                                       | Port   | What the tenant or operator uses it for                          |
| ----------- | ------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| `api`       | `apps/api/Dockerfile`                            | 4000   | API, CMS admin, storefront delivery, auth, admin, health/metrics |
| `dashboard` | `apps/dashboard/Dockerfile`                      | 3001   | Tenant workspace and studio                                      |
| `web`       | `apps/web/Dockerfile`                            | 3003   | Public storefront delivery                                       |
| `platform`  | `deploy/platform/Dockerfile` (`platform` target) | 3002   | Operator console                                                 |
| `caddy`     | `caddy:2.8-alpine`                               | 80/443 | Edge TLS and host routing                                        |

Every application service declares a healthcheck (API `/health/live`,
dashboard `/login`, storefront `/`, platform `/`) and the deploy workflow
waits for `healthy` before it reports success. Caddy starts only after all four
are healthy.

The container and proxy artifacts are:

- the per-application Dockerfiles above, all built from the repository root;
- `deploy/platform/Dockerfile` for the operator console only;
- `Dockerfile.dockerignore` — keeps `.git`, worktrees, `node_modules`, `.next` and build output out of the context;
- `docker-compose.yml` — PostgreSQL, Redis, API, Dashboard, Storefront, Platform and Caddy;
- `Caddyfile` — the operator vhost, the break-glass vhost with client-certificate authentication, the reserved marketing host and the wildcard tenant vhost (see "Host model and tenant edge" below).

The deployment env is the union of the root app `.env.example` and this directory's `.env.example`. `NEXT_PUBLIC_API_URL` must be the canonical operator origin (for example `https://ops.example.com`) because it is baked into the Platform build. The dashboard and the storefront call the API over the compose network, so the root app env must set `API_URL=http://api:4000`; `DOMAIN_ROOT` names the host family both applications route.

```bash
cp .env.example .env          # deployment-only values
cp ../../.env.example ../../.env
# CI path: the workflow pushes all four images, the host pulls them.
docker compose -f deploy/platform/docker-compose.yml pull api dashboard web platform
# Local path: build the same four images from the same Dockerfiles.
docker compose -f deploy/platform/docker-compose.yml build
docker compose -f deploy/platform/docker-compose.yml up -d
```

The deploy workflow builds and pushes exactly the images these services name
(`business-os-api`, `business-os-dashboard`, `business-os-web`,
`business-os-platform`), copies `deploy/platform` to the deploy host, runs
`preflight.sh`, pulls only services that exist, applies migrations, refuses to
finish unless every application reports `healthy`, applies and verifies the
bucket CORS policy, smoke-checks a real tenant host, and prunes the replaced
images.

The deploy host reads the compose file, the `Caddyfile` and these scripts from
`/home/developer/app`. The sync step copies `deploy/platform` there; the host's
`.env` files are not in the repository and are left in place.

The break-glass CA bundle is mounted from `deploy/platform/break-glass-ca.pem`; create it from the offline CA, never from a private key committed to the repository. The origin network policy must allow only the Caddy service (FR-069).

## Host model and tenant edge

Four distinct hosts, all declared configuration (FR-109, FR-117); the tenant
host carries two surfaces. No hostname is written into the Caddyfile; the
placeholders come from `deploy/platform/.env`, which is the file the Caddy
service loads.

The edge names are the canonical application names: `DOMAIN_ROOT`,
`MARKETING_HOST` and `OPERATOR_HOST` (declared in the root app env and read by
the storefront and the dashboard). The earlier edge-only name
`OPERATOR_DOMAIN` is gone: the deploy secret and the deploy env must use
`OPERATOR_HOST` so one value drives both the vhost and the application's host
classification. A deploy whose secret is still named `OPERATOR_DOMAIN` fails at
the workflow's secret check instead of building a console that calls
`https://`.

| Role                        | Address               | Served by                                 | Notes                                                                                                                                                                           |
| --------------------------- | --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant                      | `<label>.DOMAIN_ROOT` | `web` at `/`, `dashboard` at `/dashboard` | Wildcard vhost, one certificate for the whole family                                                                                                                            |
| Workspace and account entry | the tenant host above | `dashboard`                               | `/dashboard*`, `/login*`, `/signup*`, `/forgot-password*`, `/reset-password*`, `/link-account*`, `/invite*`, `/verify-expired*`, `/choose-tenant*`, `/onboarding*` and `/api/*` |
| Operator console            | `OPERATOR_HOST`       | `platform` at `/`, `api` at `/api/*`      | The break-glass header is stripped                                                                                                                                              |
| Marketing (reserved)        | `MARKETING_HOST`      | `web` (neutral not-found)                 | Declared and TLS-terminated; never a tenant, never the workspace, never a session                                                                                               |
| Break-glass                 | `BREAK_GLASS_DOMAIN`  | `platform` / `api`                        | Client certificate required                                                                                                                                                     |

Every vhost sends the same security headers, imported from the
`security_headers` snippet.

### Three-host model decision (FR-118, T182)

FR-118 places account and organisation creation on the marketing host, before a
tenant host exists. Release one does not ship a marketing application, and a
tenant session is host-bound, so moving sign-up to the marketing host without a
signed hand-off would strand every new account when it moves to its tenant host.

**Decision:** account entry (sign-up, sign-in, password reset, invitation) is
served by the dashboard application on the tenant host family for release one.
`MARKETING_HOST` is declared, reserved and TLS-terminated, but it answers the
storefront's neutral not-found for every path: it never serves tenant content and
never issues a session.

**Consequence:** FR-118 is met in part — an account is created before any
workspace exists, but on the workspace host family rather than on the marketing
host — and the marketing host is not a marketing surface yet. The signed hand-off
from marketing-host sign-up to the new tenant host, and the marketing content
itself, are the remaining work; the tenant-host redirect is tracked with the
first-website journey. No tenant data or session is exposed on the marketing host
in the meantime, and the decision is reversible by adding a `handle` block for
account paths to the `MARKETING_HOST` vhost once the hand-off exists.

### Required host and edge values

| Variable                   | Holds                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| `DOMAIN_ROOT`              | The tenant host family; `<label>.DOMAIN_ROOT` serves the site and the workspace |
| `MARKETING_HOST`           | The reserved marketing/account-entry host                                       |
| `OPERATOR_HOST`            | The operator console host; `CONTROL_PLANE_ORIGIN` and the WebAuthn RP id use it |
| `BREAK_GLASS_DOMAIN`       | The recovery host that requires a client certificate                            |
| `TENANT_TLS_DIR`           | Host directory with the wildcard certificate pair                               |
| `SMOKE_TENANT_HOST`        | One real tenant host the post-deploy smoke check proves                         |
| `ACME_EMAIL`               | ACME account contact for the single-label vhosts                                |
| `BREAK_GLASS_CA_CERT_PATH` | In-container path of the break-glass CA bundle                                  |

The deploy workflow reads the operator host from the `OPERATOR_HOST` repository
secret; rename the old `OPERATOR_DOMAIN` secret before the next deploy.

The tenant vhost is `*.<DOMAIN_ROOT>`. A published site is served from the root
by the storefront, which answers an unpublished site with its neutral holding or
not-found state; the workspace, the account surfaces and the API plane are
proxied to the dashboard application, which owns the `/dashboard` rewrite and
proxies `/api/v1` to the API. Sign-in has to happen on the tenant host because a
tenant session is host-bound (`__Host-` cookie, signed host claim, FR-111).

Neither application sets an `assetPrefix`, so both emit `/_next/*` asset URLs
from the same origin. The tenant vhost therefore tries the dashboard for
`/_next/*` and falls back to the storefront on its 404: a page from either
application loads its own chunks and stylesheets. The cost is one origin hop per
storefront asset on a browser cache miss; without the fallback one application's
pages are unstyled or cannot hydrate.

### Certificate issuance and renewal

A wildcard name cannot complete an HTTP-01 challenge, and the stock
`caddy:2.8-alpine` image carries no DNS provider module, so the certificate for
`*.<DOMAIN_ROOT>` is issued outside Caddy with a DNS-01 capable ACME client and
mounted read-only. `TENANT_TLS_DIR` names the host directory that holds
`fullchain.pem` and `privkey.pem`; compose mounts it at
`/etc/caddy/tenant-tls`, and `preflight.sh` fails the deploy when the directory
or either file is missing or empty.

Renew the wildcard certificate with the same DNS-01 client and reload Caddy:

```bash
docker compose -f deploy/platform/docker-compose.yml exec caddy caddy reload --config /etc/caddy/Caddyfile
```

The single-label hosts (operator, marketing, break-glass) keep Caddy's automatic
HTTPS. Issuing the wildcard inside Caddy would need a custom image built with the
DNS provider module; that is a deployment build change, not part of this edge.

## Deployment preflight

`preflight.sh` fails the deploy before any container starts. It sources the app
env and the deploy env in compose order (root first, deploy second) and checks:

- the host roles: `DOMAIN_ROOT`, `MARKETING_HOST`, `OPERATOR_HOST`,
  `BREAK_GLASS_DOMAIN` are present, are bare hostnames and are pairwise
  distinct;
- `SMOKE_TENANT_HOST` is one label under `DOMAIN_ROOT`;
- `API_URL`, `DASHBOARD_URL` and the media endpoint and public base URL are
  absolute URLs;
- `TENANT_DATABASE_URL` is a `postgresql://` URL;
- the media bucket, region, access key id and secret access key are set;
- `TENANT_TLS_DIR` exists and holds a non-empty `fullchain.pem` and
  `privkey.pem`;
- the edge keys are declared in `deploy/platform/.env` itself, because the Caddy
  service loads only that file. A value that lives only in the root app env
  would otherwise leave the edge unconfigured.

Run it against a prepared environment:

```bash
set -a; . ./.env; . ./deploy/platform/.env; set +a
./deploy/platform/preflight.sh
```

It prints every problem with the variable name and what it must hold, then exits
non-zero. The deploy workflow runs it before `docker compose pull`.

## Post-deploy smoke check

`smoke-tenant-host.sh` proves one real tenant host over TLS with the certificate
verified:

- `GET /` returns `200`, HTML and no `Set-Cookie` from the storefront, and the
  first `/_next/*` asset the page references is served;
- `GET /dashboard` answers `200` or redirects to the workspace sign-in on the
  same host (a redirect to another host, a `404` or a `5xx` fails the check);
- `GET /login` returns `200` and its first `/_next/*` asset is served, which
  proves the dashboard's chunks and stylesheets are routed through the edge;
- `GET /robots.txt` returns `200`, `text/plain` and a `Disallow:` directive.

```bash
./deploy/platform/smoke-tenant-host.sh            # uses SMOKE_TENANT_HOST
./deploy/platform/smoke-tenant-host.sh canary.tenants.example.com
```

The deploy workflow runs it after every application reports `healthy`, so a stack
that is up but does not serve a tenant host fails the job.

## Object-storage CORS

`object-storage-cors.sh` replaces the manual runbook step. It applies the
bucket CORS policy the media adapter signs (PUT, GET and HEAD from
`https://*.<DOMAIN_ROOT>` and the `DASHBOARD_URL` origin, with the checksum and
file-name headers and `ETag` exposed), then reads it back and fails when an
expected origin, method or header is missing. `MEDIA_S3_CHECKSUM_MODE=metadata`
(R2) omits `x-amz-checksum-sha256`, which is not sent in that mode.

```bash
set -a; . ./.env; . ./deploy/platform/.env; set +a
./deploy/platform/object-storage-cors.sh
```

The policy is idempotent: a re-run replaces it with the same content and verifies
it again.

## Rollback the edge

The edge has no data to roll back. Revert `Caddyfile` and
`docker-compose.yml` to the previous revision on the deploy host and reload:

```bash
docker compose -f deploy/platform/docker-compose.yml up -d caddy
```

Compose re-reads `deploy/platform/.env`. The wildcard mount is additive: an
older Caddyfile that does not reference `/etc/caddy/tenant-tls` simply ignores
it, and `TENANT_TLS_DIR` must stay set because compose interpolates it for the
caddy service. The application images roll back independently (redeploy the
previous tags).

## Break-glass admission

See [BREAK_GLASS.md](./BREAK_GLASS.md). The short version: the separate hostname requires a client certificate whose key is held offline; Caddy overwrites `X-Break-Glass-Verified`; the app page never accepts the key; the canonical host strips the header; the quarterly drill is mandatory.

## Domain move

See [DOMAIN_MOVE.md](./DOMAIN_MOVE.md). The operator domain and passkey relying-party identity are configuration, not code. A move revokes sessions, rotates `CONTROL_SESSION_SECRET`, forces every operator to re-enrol, and is rehearsed in staging before production.

## Re-seal the audit chain (break-glass)

`reseal-audit-chain.sql` is the one-time repair for a chain damaged before `20261104130000_audit_chain_integrity`. It is owner-only, skips a healthy chain, refuses a second run, detects both hash and link breaks, recomputes `prevHash`/`recordHash` in place, records the database `session_user`, and appends an `AUDIT_CHAIN_RESEALED` audit row.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/platform/reseal-audit-chain.sql
```

Run it only with written approval and a backup; the full procedure is in the Platform runbook, section 5.1.

The deploy workflow runs `prisma migrate deploy`, `prisma migrate status`, and a real `PLATFORM_DATABASE_URL` connection check. Provision the roles before the first deploy and rotate by rerunning the script.

The tenant runtime is not switched yet. `app_tenant` is provisioned, but the tenant application keeps the owner connection until the Website Builder/RLS work is replanned. That work is parked and is not part of #255.

See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for the recorded deployed-dev state.
