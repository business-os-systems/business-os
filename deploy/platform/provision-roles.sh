#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (owner/migration identity)}"
: "${APP_PLATFORM_DB_PASSWORD:?APP_PLATFORM_DB_PASSWORD is required}"
: "${APP_TENANT_DB_PASSWORD:?APP_TENANT_DB_PASSWORD is required}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql 15 or newer is required" >&2
  exit 1
fi

echo "Provisioning app_platform and app_tenant credentials..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
\getenv platform_password APP_PLATFORM_DB_PASSWORD
\getenv tenant_password APP_TENANT_DB_PASSWORD

ALTER ROLE app_platform WITH LOGIN PASSWORD :'platform_password';
ALTER ROLE app_tenant WITH LOGIN PASSWORD :'tenant_password';

DO $$
BEGIN
  IF has_schema_privilege('app_tenant', 'platform', 'USAGE') THEN
    RAISE EXCEPTION 'Grant boundary failed: app_tenant can use the platform schema';
  END IF;
  IF has_table_privilege('app_tenant', 'platform.operators', 'SELECT') THEN
    RAISE EXCEPTION 'Grant boundary failed: app_tenant can read platform.operators';
  END IF;
  IF NOT has_schema_privilege('app_platform', 'platform', 'USAGE') THEN
    RAISE EXCEPTION 'Grant boundary failed: app_platform cannot use the platform schema';
  END IF;
  IF NOT has_table_privilege('app_platform', 'platform.operators', 'SELECT') THEN
    RAISE EXCEPTION 'Grant boundary failed: app_platform cannot read platform.operators';
  END IF;
  IF NOT has_table_privilege('app_tenant', 'reference.v_active_catalog_values', 'SELECT') THEN
    RAISE EXCEPTION 'Grant boundary failed: app_tenant cannot read the active catalog view';
  END IF;
END
$$;
SQL

echo "Credentials provisioned and grant boundary verified."
