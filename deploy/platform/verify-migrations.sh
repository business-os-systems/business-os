#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required (owner/migration identity)}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql 15 or newer is required" >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(expected.name, ', ') INTO missing
  FROM (VALUES
    ('20261025161000_platform_foundation'),
    ('20261025172000_platform_views'),
    ('20261029150000_audit_append_trigger'),
    ('20261029160000_audit_pending_check'),
    ('20261029170000_audit_search_path'),
    ('20261104120000_platform_audited_functions'),
    ('20261104130000_audit_chain_integrity'),
    ('20261104140000_platform_tenant_admin_contacts'),
    ('20261104150000_platform_notification_contacts_audit')
  ) AS expected(name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM _prisma_migrations applied
    WHERE applied.migration_name = expected.name
      AND applied.finished_at IS NOT NULL
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Platform migrations are not applied: %', missing;
  END IF;

  IF NOT has_schema_privilege('app_platform', 'platform', 'USAGE') THEN
    RAISE EXCEPTION 'Platform grant missing: app_platform cannot use the platform schema';
  END IF;
  IF NOT has_table_privilege('app_platform', 'platform.operators', 'SELECT') THEN
    RAISE EXCEPTION 'Platform grant missing: app_platform cannot read platform.operators';
  END IF;
  IF has_table_privilege('app_platform', 'platform.audit_events', 'UPDATE') THEN
    RAISE EXCEPTION 'Audit boundary failed: app_platform can update platform.audit_events';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'platform_audit_append'
      AND tgrelid = 'platform.audit_events'::regclass
  ) THEN
    RAISE EXCEPTION 'Audit trigger platform_audit_append is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_events_actorOperatorId_fkey'
      AND confdeltype = 'r'
  ) THEN
    RAISE EXCEPTION 'Audit chain integrity: actor FK is not ON DELETE RESTRICT (D-027)';
  END IF;

  -- The notification audience is defined in the database, not in the tenant
  -- runtime: the tenant role must never read another tenant's contact data.
  IF NOT has_function_privilege(
    'app_platform',
    'platform.fn_tenant_admin_contacts(text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Notification boundary failed: app_platform cannot execute fn_tenant_admin_contacts';
  END IF;
  IF has_function_privilege(
    'app_tenant',
    'platform.fn_tenant_admin_contacts(text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Notification boundary failed: app_tenant can execute fn_tenant_admin_contacts';
  END IF;
END
$$;

SELECT migration_name, finished_at
FROM _prisma_migrations
WHERE migration_name IN (
  '20261025161000_platform_foundation',
  '20261025172000_platform_views',
  '20261029150000_audit_append_trigger',
  '20261029160000_audit_pending_check',
  '20261029170000_audit_search_path',
  '20261104120000_platform_audited_functions',
  '20261104130000_audit_chain_integrity',
  '20261104140000_platform_tenant_admin_contacts',
  '20261104150000_platform_notification_contacts_audit'
)
ORDER BY started_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_events_record_hash_not_pending'
  ) THEN
    RAISE EXCEPTION 'Audit recordHash PENDING check is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'fn_audit_append'
      AND 'search_path=pg_catalog, platform' = ANY(proconfig)
  ) THEN
    RAISE EXCEPTION 'Audit trigger fn_audit_append search_path is unsafe';
  END IF;
END $$;
SQL

echo "Platform migrations and app_platform grants are verified."
