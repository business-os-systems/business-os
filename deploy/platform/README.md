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

## Re-seal the audit chain (break-glass)

`reseal-audit-chain.sql` is the one-time repair for a chain damaged before `20261104130000_audit_chain_integrity`. It is owner-only, skips a healthy chain, refuses a second run, detects both hash and link breaks, recomputes `prevHash`/`recordHash` in place, records the database `session_user`, and appends an `AUDIT_CHAIN_RESEALED` audit row.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/platform/reseal-audit-chain.sql
```

Run it only with written approval and a backup; the full procedure is in the Platform runbook, section 5.1.

The deploy workflow runs `prisma migrate deploy`, `prisma migrate status`, and a real `PLATFORM_DATABASE_URL` connection check. Provision the roles before the first deploy and rotate by rerunning the script.

The tenant runtime is not switched yet. `app_tenant` is provisioned, but the tenant application keeps the owner connection until the Website Builder/RLS work is replanned. That work is parked and is not part of #255.

See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for the recorded deployed-dev state.
