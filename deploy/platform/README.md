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

## Verify migrations

After a deploy:

```bash
set -a
. ./deploy/platform/.env
set +a
./deploy/platform/verify-migrations.sh
```

It fails if the foundation or view migration is missing, or if `app_platform` cannot reach the Platform schema.

The deploy workflow runs `prisma migrate deploy`, `prisma migrate status`, and a real `PLATFORM_DATABASE_URL` connection check. Provision the roles before the first deploy and rotate by rerunning the script.

The tenant runtime is not switched yet. `app_tenant` is provisioned, but the tenant application keeps the owner connection until the Website Builder/RLS work is replanned. That work is parked and is not part of #255.

See [MIGRATION_STATUS.md](./MIGRATION_STATUS.md) for the recorded deployed-dev state.
