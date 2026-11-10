-- ==============================================================================
-- Tenant runtime identity: RLS, tenant grants and the tenant flag projection
-- T167 / T197 (#315), DB-1 and DB-2.
--
-- Forward-only. This migration does not switch any runtime to app_tenant and
-- does not change core.prisma. The owner connection keeps working: core tenant
-- tables are protected with ENABLE (not FORCE) ROW LEVEL SECURITY, so the table
-- owner still bypasses the policies while app_tenant is filtered.
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- 1. Core tenant tables: row-level security keyed by the request GUC
-- ==============================================================================
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_organizations" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'branches'
      AND policyname = 'branches_tenant_isolation'
  ) THEN
    CREATE POLICY "branches_tenant_isolation" ON "branches"
      FOR ALL
      USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
      WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_organizations'
      AND policyname = 'user_organizations_tenant_isolation'
  ) THEN
    CREATE POLICY "user_organizations_tenant_isolation" ON "user_organizations"
      FOR ALL
      USING ("organizationId" = CURRENT_SETTING('app.current_organization_id', true))
      WITH CHECK ("organizationId" = CURRENT_SETTING('app.current_organization_id', true));
  END IF;
END $$;

-- ==============================================================================
-- 2. CMS tenant tables: re-assert RLS before granting app_tenant access.
--    The policies were created by 20261011181500; this block is defensive so a
--    drifted database that lost a policy cannot silently expose every tenant.
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    policy_name text;
    tenant_tables text[] := ARRAY[
        'cms_sites',
        'cms_site_settings',
        'cms_domains',
        'cms_pages',
        'cms_page_contents',
        'cms_page_versions',
        'cms_page_comments',
        'cms_collections',
        'cms_collection_items',
        'cms_site_seo_settings',
        'cms_site_locales',
        'cms_page_translations',
        'cms_url_redirects',
        'cms_form_submissions',
        'cms_site_analytics_daily',
        'cms_plugin_installations',
        'cms_navigation_menus',
        'cms_audit_trails'
    ];
BEGIN
    FOREACH tbl IN ARRAY tenant_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);

        policy_name := tbl || '_tenant_isolation';
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = tbl
              AND policyname = policy_name
        ) THEN
            EXECUTE format('
                CREATE POLICY %I ON %I
                FOR ALL
                USING ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))
                WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true));
            ', policy_name, tbl);
        END IF;
    END LOOP;
END $$;

-- Hybrid rows: global presets (organizationId IS NULL) are readable, writes
-- are restricted to the current organization.
DO $$
DECLARE
    tbl text;
    read_policy text;
    insert_policy text;
    hybrid_tables text[] := ARRAY[
        'cms_themes',
        'cms_templates',
        'cms_section_templates'
    ];
BEGIN
    FOREACH tbl IN ARRAY hybrid_tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', tbl);

        read_policy := tbl || '_tenant_and_global';
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = tbl
              AND policyname = read_policy
        ) THEN
            EXECUTE format('
                CREATE POLICY %I ON %I
                FOR SELECT
                USING ("organizationId" IS NULL OR "organizationId" = CURRENT_SETTING(''app.current_organization_id'', true));
            ', read_policy, tbl);
        END IF;

        insert_policy := tbl || '_tenant_mutation';
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = tbl
              AND policyname = insert_policy
        ) THEN
            EXECUTE format('
                CREATE POLICY %I ON %I
                FOR INSERT
                WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true));
            ', insert_policy, tbl);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 3. Tenant grants: PUBLIC is revoked, app_tenant gets only tenant rows.
--    app_platform keeps its existing grants; it is not changed here.
-- ==============================================================================
REVOKE ALL ON TABLE "branches" FROM PUBLIC;
REVOKE ALL ON TABLE "user_organizations" FROM PUBLIC;
REVOKE ALL ON TABLE "branches" FROM app_tenant;
REVOKE ALL ON TABLE "user_organizations" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "branches" TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_organizations" TO app_tenant;

-- Owned CMS tables: full row lifecycle inside the tenant boundary.
DO $$
DECLARE
    tbl text;
    owned_tables text[] := ARRAY[
        'cms_sites',
        'cms_site_settings',
        'cms_domains',
        'cms_pages',
        'cms_page_contents',
        'cms_page_comments',
        'cms_collections',
        'cms_collection_items',
        'cms_site_seo_settings',
        'cms_site_locales',
        'cms_page_translations',
        'cms_url_redirects',
        'cms_form_submissions',
        'cms_site_analytics_daily',
        'cms_plugin_installations',
        'cms_navigation_menus'
    ];
BEGIN
    FOREACH tbl IN ARRAY owned_tables LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC;', tbl);
        EXECUTE format('REVOKE ALL ON TABLE %I FROM app_tenant;', tbl);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO app_tenant;', tbl);
    END LOOP;

    -- Append-only tenant tables: history may be written and read, never
    -- rewritten or deleted by the runtime identity.
    FOREACH tbl IN ARRAY ARRAY['cms_page_versions', 'cms_audit_trails'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC;', tbl);
        EXECUTE format('REVOKE ALL ON TABLE %I FROM app_tenant;', tbl);
        EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO app_tenant;', tbl);
    END LOOP;

    -- Hybrid preset tables: read global or owned rows, insert owned rows only.
    FOREACH tbl IN ARRAY ARRAY['cms_themes', 'cms_templates', 'cms_section_templates'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC;', tbl);
        EXECUTE format('REVOKE ALL ON TABLE %I FROM app_tenant;', tbl);
        EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO app_tenant;', tbl);
    END LOOP;
END $$;

-- ==============================================================================
-- 4. Read-only tenant feature-flag projection.
--    Control-plane flag tables stay revoked from app_tenant. The view exposes
--    only evaluation fields and the rules that may apply to the current tenant:
--    environment rules plus ORGANIZATION rules whose target is the request GUC.
--    owner/removalTicket and the audit log are never projected.
-- ==============================================================================
CREATE OR REPLACE VIEW "public"."v_tenant_feature_flags" AS
SELECT
    f."id",
    f."key",
    f."name",
    f."description",
    f."environment",
    f."isEnabled",
    f."defaultEnabled",
    f."version",
    f."metadata",
    f."expiresAt",
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r."id",
                    'ruleType', r."rule_type",
                    'targetId', r."target_id",
                    'enabled', r."enabled",
                    'priority', r."priority"
                )
                ORDER BY r."priority" DESC, r."id"
            )
            FROM "public"."system_feature_flag_rules" r
            WHERE r."flag_id" = f."id"
              AND (
                  r."rule_type" = 'ENVIRONMENT'
                  OR (
                      r."rule_type" = 'ORGANIZATION'
                      AND r."target_id" = CURRENT_SETTING('app.current_organization_id', true)
                  )
              )
        ),
        '[]'::jsonb
    ) AS "rules"
FROM "public"."system_feature_flags" f;

REVOKE ALL ON TABLE "public"."v_tenant_feature_flags" FROM PUBLIC;
REVOKE ALL ON TABLE "public"."v_tenant_feature_flags" FROM app_platform;
REVOKE ALL ON TABLE "public"."v_tenant_feature_flags" FROM app_tenant;
GRANT SELECT ON TABLE "public"."v_tenant_feature_flags" TO app_tenant;

COMMENT ON VIEW "public"."v_tenant_feature_flags" IS
    'Read-only tenant projection for feature-flag evaluation. Exposes environment rules and ORGANIZATION rules targeting app.current_organization_id; the control-plane flag tables remain revoked from app_tenant (DB-2, T167/T197).';
