# Platform deployment helpers

These scripts run against the deployment database as the owner/migration identity. They are not part of the application runtime.

## Provision runtime credentials

1. Copy `.env.example` to a deployment-only `.env` and set `DATABASE_URL`, `APP_PLATFORM_DB_PASSWORD` and `APP_TENANT_DB_PASSWORD`.
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

The container and proxy artifacts are in this directory:

- `Dockerfile` — multi-stage build with `api` and `platform` targets. The build context is the repository root.
- `Dockerfile.dockerignore` — keeps `.git`, worktrees, `node_modules`, `.next` and build output out of the context.
- `docker-compose.yml` — PostgreSQL, Redis, API, Platform and Caddy.
- `Caddyfile` — the canonical operator vhost and the separate break-glass vhost with client-certificate authentication.

The deployment env is the union of the root app `.env.example` and this directory's `.env.example`. `NEXT_PUBLIC_API_URL` must be the canonical operator origin (for example `https://ops.example.com`) because it is baked into the Platform build.

```bash
cp .env.example .env          # deployment-only values
cp ../../.env.example ../../.env
docker compose -f deploy/platform/docker-compose.yml build
docker compose -f deploy/platform/docker-compose.yml up -d
```

The break-glass CA bundle is mounted from `deploy/platform/break-glass-ca.pem`; create it from the offline CA, never from a private key committed to the repository. The origin network policy must allow only the Caddy service (FR-069).

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
