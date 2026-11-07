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
    ('20261104150000_platform_notification_contacts_audit'),
    ('20261105001000_platform_flag_lifecycle'),
    ('20261105002000_platform_flag_rules_and_retention'),
    ('20261106090000_platform_app_entitlements'),
    ('20261106100000_platform_retire_unversioned_writes'),
    ('20261106120000_platform_quota_versioning'),
    ('20261106130000_platform_retire_unversioned_quota'),
    ('20261106140000_platform_quota_create_guard')
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

  -- Entitlements and app settings are read through a granted view and written
  -- through definer functions: the Platform identity must never hold a direct
  -- grant on the tenant-owned public tables (DB-2).
  IF NOT has_table_privilege(
    'app_platform',
    'platform.v_tenant_app_entitlements',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_platform cannot read v_tenant_app_entitlements';
  END IF;
  IF has_table_privilege(
    'app_tenant',
    'platform.v_tenant_app_entitlements',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_tenant can read v_tenant_app_entitlements';
  END IF;
  IF has_table_privilege('app_platform', 'public.installed_apps', 'UPDATE') THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_platform can update public.installed_apps directly';
  END IF;
  IF NOT has_function_privilege(
    'app_platform',
    'platform.fn_set_entitlement_versioned(text, text, boolean, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_platform cannot execute fn_set_entitlement_versioned';
  END IF;
  IF has_function_privilege(
    'app_tenant',
    'platform.fn_set_entitlement_versioned(text, text, boolean, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_tenant can execute fn_set_entitlement_versioned';
  END IF;
  IF NOT has_function_privilege(
    'app_platform',
    'platform.fn_set_app_setting_versioned(text, text, jsonb, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_platform cannot execute fn_set_app_setting_versioned';
  END IF;
  IF has_function_privilege(
    'app_tenant',
    'platform.fn_set_app_setting_versioned(text, text, jsonb, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_tenant can execute fn_set_app_setting_versioned';
  END IF;
  -- The unversioned writers are superseded. A platform runtime that can call
  -- them could bypass the optimistic-concurrency guard (CT-3).
  IF has_function_privilege(
    'app_platform',
    'platform.fn_set_entitlement(text, text, boolean, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_platform can execute the retired fn_set_entitlement';
  END IF;
  IF has_function_privilege(
    'app_platform',
    'platform.fn_set_app_setting(text, text, jsonb, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Entitlement boundary failed: app_platform can execute the retired fn_set_app_setting';
  END IF;

  -- Quota writes go through the versioned function only; the tenant identity
  -- must not reach the platform schema.
  IF NOT has_function_privilege(
    'app_platform',
    'platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Quota boundary failed: app_platform cannot execute fn_set_quota_versioned';
  END IF;
  IF has_function_privilege(
    'app_tenant',
    'platform.fn_set_quota_versioned(text, text, bigint, boolean, text, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Quota boundary failed: app_tenant can execute fn_set_quota_versioned';
  END IF;
  -- The unversioned quota write is retired: neither the function nor a direct
  -- table update may bypass the version guard and audit row (CT-3).
  IF has_function_privilege(
    'app_platform',
    'platform.fn_set_quota(text, text, bigint, boolean, text, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Quota boundary failed: app_platform can execute the retired fn_set_quota';
  END IF;
  IF has_table_privilege('app_platform', 'platform.quotas', 'INSERT') THEN
    RAISE EXCEPTION 'Quota boundary failed: app_platform can insert into platform.quotas directly';
  END IF;
  IF has_table_privilege('app_platform', 'platform.quotas', 'UPDATE') THEN
    RAISE EXCEPTION 'Quota boundary failed: app_platform can update platform.quotas directly';
  END IF;
  IF has_table_privilege('app_platform', 'platform.quotas', 'DELETE') THEN
    RAISE EXCEPTION 'Quota boundary failed: app_platform can delete platform.quotas';
  END IF;
  IF has_table_privilege('app_platform', 'platform.quotas', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Quota boundary failed: app_platform can truncate platform.quotas';
  END IF;

  -- Feature flags live in public but are control-plane configuration. The
  -- Platform identity may read and mutate them; the tenant identity may not,
  -- and neither may delete them.
  IF NOT has_table_privilege('app_platform', 'public.system_feature_flags', 'SELECT') THEN
    RAISE EXCEPTION 'Flag boundary failed: app_platform cannot read system_feature_flags';
  END IF;
  IF NOT has_table_privilege('app_platform', 'public.system_feature_flag_audit_logs', 'INSERT') THEN
    RAISE EXCEPTION 'Flag boundary failed: app_platform cannot write the flag audit log';
  END IF;
  IF has_table_privilege('app_platform', 'public.system_feature_flags', 'DELETE') THEN
    RAISE EXCEPTION 'Flag boundary failed: app_platform can delete system_feature_flags';
  END IF;
  IF has_table_privilege('app_tenant', 'public.system_feature_flags', 'SELECT') THEN
    RAISE EXCEPTION 'Flag boundary failed: app_tenant can read system_feature_flags';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'system_feature_flags_lifecycle_required'
  ) THEN
    RAISE EXCEPTION 'Flag lifecycle check system_feature_flags_lifecycle_required is missing (OP-8)';
  END IF;
  IF NOT has_table_privilege('app_platform', 'public.system_feature_flag_rules', 'DELETE') THEN
    RAISE EXCEPTION 'Flag boundary failed: app_platform cannot replace targeting rules';
  END IF;
  IF has_table_privilege('app_tenant', 'public.system_feature_flag_rules', 'SELECT') THEN
    RAISE EXCEPTION 'Flag boundary failed: app_tenant can read system_feature_flag_rules';
  END IF;
  IF COALESCE(obj_description('public.system_feature_flag_audit_logs'::regclass), '') NOT LIKE '%24 months%' THEN
    RAISE EXCEPTION 'Flag audit retention is not declared (OP-6)';
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
  '20261104150000_platform_notification_contacts_audit',
  '20261105001000_platform_flag_lifecycle',
  '20261105002000_platform_flag_rules_and_retention',
  '20261106090000_platform_app_entitlements',
  '20261106100000_platform_retire_unversioned_writes',
  '20261106120000_platform_quota_versioning',
  '20261106130000_platform_retire_unversioned_quota',
  '20261106140000_platform_quota_create_guard'
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
