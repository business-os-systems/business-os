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

The script sets both role passwords and then runs the grant-boundary checks:

- `app_tenant` has no `USAGE` on `platform`.
- `app_tenant` cannot select `platform.operators`.
- `app_platform` has `USAGE` on `platform` and can select `platform.operators`.
- `app_tenant` can select `reference.v_active_catalog_values`.

Rotating a password is the same command followed by a restart of the API/dashboard processes so they pick up the new `PLATFORM_DATABASE_URL`.

The tenant application still connects with the owner `DATABASE_URL`. Switching it to `app_tenant`, wiring this step into the deploy gate, and verifying the deployed migrations are tracked in #255. Do not claim the runtime tenant boundary until that switch is done.
