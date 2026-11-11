-- ==============================================================================
-- T-01 (#346): move every cms table into the dedicated cms schema
--
-- One forward-only unit (DB-4): DDL, grants and RLS. No backfill, so DDL and
-- data movement stay separate (DB-5) and no row is rewritten.
--
-- What this migration does:
--   1. creates schema cms and moves the nine cms enum types and 23 cms tables
--      (21 legacy + 2 catalog) out of public, preserving every intra-cms
--      foreign key and index;
--   2. removes the two legacy cms_sites foreign keys that would cross the
--      schema boundary once the table moves (DB-3); tenancy remains the
--      scalar organizationId column and no reverse core relation is added;
--   3. points the two storefront SECURITY DEFINER helpers at cms and refreshes
--      platform.v_tenant_usage so the control-plane usage projection resolves
--      cms."cms_pages" and cms."cms_domains";
--   4. revokes PUBLIC, grants app_tenant per table (catalog rows are read-only
--      and global rows are readable, writes stay tenant-owned) and preserves
--      app_platform's catalog administration grants;
--   5. enables and forces RLS keyed on app.current_organization_id, with
--      global/hybrid rows readable and writes restricted to the tenant.
--
-- app_tenant never receives USAGE on public, platform or reference and never
-- receives a grant on a control-plane table (DB-2). The migration runs as the
-- schema owner, never as an application role (DB-1). Every statement is
-- guarded so a re-run against an already-migrated database is a no-op.
-- ==============================================================================

SET lock_timeout = '5s';

-- ==============================================================================
-- 1. The schema itself
-- ==============================================================================
CREATE SCHEMA IF NOT EXISTS "cms";

COMMENT ON SCHEMA "cms" IS
    'Website Builder / CMS application plane. Owned by the website-builder schema owner; app_tenant reads and writes only tenant-owned rows, app_platform administers the catalog, PUBLIC has no privileges (DB-2, DB-3).';

-- ==============================================================================
-- 2. Move the enum types first: table columns depend on them, and Prisma
--    declares every cms enum with @@schema("cms").
-- ==============================================================================
DO $$
DECLARE
    typ text;
    cms_types text[] := ARRAY[
        'CmsSiteStatus',
        'CmsDomainStatus',
        'CmsPageStatus',
        'CmsLocaleStatus',
        'CmsFormSubmissionStatus',
        'CmsRedirectType',
        'CmsCatalogKind',
        'CmsCatalogScope',
        'CmsCatalogStatus'
    ];
BEGIN
    FOREACH typ IN ARRAY cms_types LOOP
        IF EXISTS (
            SELECT 1
            FROM pg_type t
            JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE t.typname = typ AND n.nspname = 'public'
        ) THEN
            EXECUTE format('ALTER TYPE %I.%I SET SCHEMA %I', 'public', typ, 'cms');
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 3. Drop the legacy foreign keys that cannot resolve inside cms.
--    They were already removed by 20261022115858 in every database that ran
--    the full chain; the guard keeps a drifted database from carrying a
--    cross-schema foreign key into the move.
-- ==============================================================================
ALTER TABLE IF EXISTS "public"."cms_sites"
    DROP CONSTRAINT IF EXISTS "cms_sites_organizationId_fkey";
ALTER TABLE IF EXISTS "public"."cms_sites"
    DROP CONSTRAINT IF EXISTS "cms_sites_branchId_fkey";

-- ==============================================================================
-- 4. Move the 23 tables. A table already in cms is left alone, which makes
--    the move safe to re-run.
-- ==============================================================================
ALTER TABLE IF EXISTS "public"."cms_sites" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_site_settings" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_domains" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_pages" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_page_contents" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_page_versions" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_page_comments" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_collections" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_collection_items" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_themes" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_templates" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_section_templates" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_site_seo_settings" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_site_locales" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_page_translations" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_url_redirects" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_form_submissions" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_site_analytics_daily" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_plugin_installations" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_navigation_menus" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_audit_trails" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_catalog_items" SET SCHEMA "cms";
ALTER TABLE IF EXISTS "public"."cms_catalog_item_versions" SET SCHEMA "cms";

-- The catalog immutability trigger function is cms-owned; move it with its
-- table so no cms behaviour is left in public.
DO $$
BEGIN
    IF to_regprocedure('public.cms_catalog_item_versions_reject_update()') IS NOT NULL THEN
        ALTER FUNCTION "public"."cms_catalog_item_versions_reject_update"() SET SCHEMA "cms";
    END IF;
END $$;

-- Exactly one home page per site (T012). Prisma cannot declare a partial
-- unique index, so the database owns it.
CREATE UNIQUE INDEX IF NOT EXISTS "cms_pages_one_home_page_per_site_key"
    ON "cms"."cms_pages" ("siteId")
    WHERE "isHomePage";

-- ==============================================================================
-- 5. Storefront helpers: they keep their public callable name but resolve
--    tables through cms. pg_catalog stays first so a writable schema can
--    never shadow a built-in (search-path hijack hardening).
-- ==============================================================================
ALTER FUNCTION "public"."cms_resolve_domain"(text)
    SET search_path = pg_catalog, cms;
-- The prototype ingestion helper is retired by 20261111160000; a replay after
-- that migration must be a no-op instead of failing.
DO $$
BEGIN
    IF to_regprocedure('public.cms_ingest_form_submission(text, text, text, jsonb, jsonb, text)') IS NOT NULL THEN
        ALTER FUNCTION "public"."cms_ingest_form_submission"(text, text, text, jsonb, jsonb, text)
            SET search_path = pg_catalog, cms;
    END IF;
END $$;

-- ==============================================================================
-- 6. Control-plane usage projection: keep the quota surface working after the
--    move. The definition is otherwise unchanged from 20261107150000.
-- ==============================================================================
CREATE OR REPLACE VIEW platform."v_tenant_usage" AS
WITH measured AS (
  SELECT
    q."organizationId",
    q."resourceKey",
    q."limitValue",
    q."isEnforced",
    q."updatedAt" AS "limitUpdatedAt",
    CASE q."resourceKey"
      WHEN 'core.branches' THEN (
        SELECT count(*)::bigint
        FROM public."branches" b
        WHERE b."organizationId" = q."organizationId"
          AND b."status" <> 'ARCHIVED'
      )
      WHEN 'core.members' THEN (
        SELECT count(*)::bigint
        FROM public."user_organizations" uo
        WHERE uo."organizationId" = q."organizationId"
          AND uo."status" <> 'REVOKED'
      )
      WHEN 'cms.pages' THEN (
        SELECT count(*)::bigint
        FROM cms."cms_pages" p
        WHERE p."organizationId" = q."organizationId"
          AND p."status" <> 'ARCHIVED'
      )
      WHEN 'cms.custom_domains' THEN (
        SELECT count(*)::bigint
        FROM cms."cms_domains" d
        WHERE d."organizationId" = q."organizationId"
          AND d."status" <> 'DELETED'
          AND d."isSubdomain" = false
      )
      ELSE NULL
    END AS "currentValue",
    CASE q."resourceKey"
      WHEN 'media.storage' THEN 'bytes'
      WHEN 'core.branches' THEN 'count'
      WHEN 'core.members' THEN 'count'
      WHEN 'cms.pages' THEN 'count'
      WHEN 'cms.custom_domains' THEN 'count'
      ELSE NULL
    END AS "unit"
  FROM platform."quotas" q
)
SELECT
  m."organizationId",
  m."resourceKey",
  m."limitValue",
  m."unit",
  m."isEnforced",
  m."currentValue",
  (m."currentValue" IS NOT NULL) AS "isMeasurable",
  now() AS "asOf",
  m."limitUpdatedAt",
  (
    m."currentValue" IS NOT NULL
    AND m."currentValue" > m."limitValue"
  ) AS "isOverLimit"
FROM measured m;

-- ==============================================================================
-- 7. Grants. Schema usage is explicit; PUBLIC loses every privilege.
-- ==============================================================================
REVOKE ALL ON SCHEMA "cms" FROM PUBLIC;
GRANT USAGE ON SCHEMA "cms" TO app_tenant;
GRANT USAGE ON SCHEMA "cms" TO app_platform;

-- CmsFormSubmissionStatus becomes CmsInquiryStatus in 20261111160000, so
-- the type grants are resolved by name and skipped when a type has been renamed.
DO $$
DECLARE
    typ text;
    cms_type_names text[] := ARRAY[
        'CmsSiteStatus',
        'CmsDomainStatus',
        'CmsPageStatus',
        'CmsLocaleStatus',
        'CmsFormSubmissionStatus',
        'CmsInquiryStatus',
        'CmsRedirectType',
        'CmsCatalogKind',
        'CmsCatalogScope',
        'CmsCatalogStatus'
    ];
BEGIN
    FOREACH typ IN ARRAY cms_type_names LOOP
        IF to_regtype(format('%I.%I', 'cms', typ)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('REVOKE ALL ON TYPE %I.%I FROM PUBLIC', 'cms', typ);
        EXECUTE format('GRANT USAGE ON TYPE %I.%I TO app_tenant, app_platform', 'cms', typ);
    END LOOP;
END $$;

-- Tenant-owned tables: full row lifecycle inside the tenant boundary.
-- (UI/editor tables that a tenant creates, edits and deletes.)
REVOKE ALL ON TABLE "cms"."cms_sites" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_sites" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_sites" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_site_settings" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_site_settings" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_site_settings" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_domains" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_domains" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_domains" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_pages" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_pages" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_pages" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_page_contents" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_page_contents" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_page_contents" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_page_comments" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_page_comments" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_page_comments" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_collections" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_collections" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_collections" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_collection_items" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_collection_items" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_collection_items" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_site_seo_settings" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_site_seo_settings" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_site_seo_settings" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_site_locales" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_site_locales" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_site_locales" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_page_translations" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_page_translations" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_page_translations" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_url_redirects" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_url_redirects" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_url_redirects" TO app_tenant;

-- Renamed to cms_inquiries by 20261111160000; guard so the replay is a no-op.
DO $$
BEGIN
    IF to_regclass('cms.cms_form_submissions') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON TABLE "cms"."cms_form_submissions" FROM PUBLIC';
        EXECUTE 'REVOKE ALL ON TABLE "cms"."cms_form_submissions" FROM app_tenant';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_form_submissions" TO app_tenant';
    END IF;
END $$;

REVOKE ALL ON TABLE "cms"."cms_site_analytics_daily" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_site_analytics_daily" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_site_analytics_daily" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_plugin_installations" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_plugin_installations" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_plugin_installations" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_navigation_menus" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_navigation_menus" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_navigation_menus" TO app_tenant;

-- Append-only tenant tables: history may be written and read, never rewritten
-- or deleted by the runtime identity.
REVOKE ALL ON TABLE "cms"."cms_page_versions" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_page_versions" FROM app_tenant;
GRANT SELECT, INSERT ON TABLE "cms"."cms_page_versions" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_audit_trails" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_audit_trails" FROM app_tenant;
GRANT SELECT, INSERT ON TABLE "cms"."cms_audit_trails" TO app_tenant;

-- Hybrid preset tables: read global or owned rows, write owned rows only.
REVOKE ALL ON TABLE "cms"."cms_themes" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_themes" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_themes" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_templates" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_templates" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_templates" TO app_tenant;

REVOKE ALL ON TABLE "cms"."cms_section_templates" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_section_templates" FROM app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."cms_section_templates" TO app_tenant;

-- Catalog tables: the platform administers them; a tenant may only read global
-- rows and its own tenant-private rows. app_platform keeps the exact grants it
-- received in 20261111130000 (it never receives DELETE; retired rows remain).
REVOKE ALL ON TABLE "cms"."cms_catalog_items" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_catalog_items" FROM app_tenant;
REVOKE ALL ON TABLE "cms"."cms_catalog_items" FROM app_platform;
GRANT SELECT ON TABLE "cms"."cms_catalog_items" TO app_tenant;
GRANT SELECT, INSERT, UPDATE ON TABLE "cms"."cms_catalog_items" TO app_platform;

REVOKE ALL ON TABLE "cms"."cms_catalog_item_versions" FROM PUBLIC;
REVOKE ALL ON TABLE "cms"."cms_catalog_item_versions" FROM app_tenant;
REVOKE ALL ON TABLE "cms"."cms_catalog_item_versions" FROM app_platform;
GRANT SELECT ON TABLE "cms"."cms_catalog_item_versions" TO app_tenant;
GRANT SELECT, INSERT ON TABLE "cms"."cms_catalog_item_versions" TO app_platform;

-- ==============================================================================
-- 8. Row-level security. Every cms table is enabled and forced, so neither the
--    owner nor an application role bypasses a policy.
-- ==============================================================================
DO $$
DECLARE
    tbl text;
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
        IF to_regclass(format('%I.%I', 'cms', tbl)) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'cms', tbl);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'cms', tbl);

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'cms'
              AND tablename = tbl
              AND policyname = tbl || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR ALL USING ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true)) WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))',
                tbl || '_tenant_isolation', 'cms', tbl
            );
        END IF;
    END LOOP;
END $$;

-- Hybrid rows: global presets (organizationId IS NULL) are readable by every
-- tenant; every write must belong to the current organization.
DO $$
DECLARE
    tbl text;
    hybrid_tables text[] := ARRAY[
        'cms_themes',
        'cms_templates',
        'cms_section_templates'
    ];
BEGIN
    FOREACH tbl IN ARRAY hybrid_tables LOOP
        EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'cms', tbl);
        EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', 'cms', tbl);

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'cms' AND tablename = tbl
              AND policyname = tbl || '_tenant_and_global'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR SELECT USING ("organizationId" IS NULL OR "organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))',
                tbl || '_tenant_and_global', 'cms', tbl
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'cms' AND tablename = tbl
              AND policyname = tbl || '_tenant_mutation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR INSERT WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))',
                tbl || '_tenant_mutation', 'cms', tbl
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'cms' AND tablename = tbl
              AND policyname = tbl || '_tenant_update'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR UPDATE USING ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true)) WITH CHECK ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))',
                tbl || '_tenant_update', 'cms', tbl
            );
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'cms' AND tablename = tbl
              AND policyname = tbl || '_tenant_delete'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I.%I FOR DELETE USING ("organizationId" = CURRENT_SETTING(''app.current_organization_id'', true))',
                tbl || '_tenant_delete', 'cms', tbl
            );
        END IF;
    END LOOP;
END $$;

-- Catalog tables: platform administration is row-unrestricted for app_platform;
-- a tenant reads only global rows and rows it owns. Versions inherit the item's
-- visibility because a version row has no organizationId of its own.
DO $$
BEGIN
    ALTER TABLE "cms"."cms_catalog_items" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "cms"."cms_catalog_items" FORCE ROW LEVEL SECURITY;
    ALTER TABLE "cms"."cms_catalog_item_versions" ENABLE ROW LEVEL SECURITY;
    ALTER TABLE "cms"."cms_catalog_item_versions" FORCE ROW LEVEL SECURITY;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms' AND tablename = 'cms_catalog_items'
          AND policyname = 'cms_catalog_items_platform_rw'
    ) THEN
        CREATE POLICY "cms_catalog_items_platform_rw"
            ON "cms"."cms_catalog_items"
            FOR ALL
            TO app_platform
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms' AND tablename = 'cms_catalog_items'
          AND policyname = 'cms_catalog_items_tenant_read'
    ) THEN
        CREATE POLICY "cms_catalog_items_tenant_read"
            ON "cms"."cms_catalog_items"
            FOR SELECT
            TO app_tenant
            USING (
                "organizationId" IS NULL
                OR "organizationId" = CURRENT_SETTING('app.current_organization_id', true)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms' AND tablename = 'cms_catalog_item_versions'
          AND policyname = 'cms_catalog_item_versions_platform_rw'
    ) THEN
        CREATE POLICY "cms_catalog_item_versions_platform_rw"
            ON "cms"."cms_catalog_item_versions"
            FOR ALL
            TO app_platform
            USING (true)
            WITH CHECK (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'cms' AND tablename = 'cms_catalog_item_versions'
          AND policyname = 'cms_catalog_item_versions_tenant_read'
    ) THEN
        CREATE POLICY "cms_catalog_item_versions_tenant_read"
            ON "cms"."cms_catalog_item_versions"
            FOR SELECT
            TO app_tenant
            USING (
                EXISTS (
                    SELECT 1
                    FROM "cms"."cms_catalog_items" item
                    WHERE item."id" = "cms_catalog_item_versions"."itemId"
                      AND (
                          item."organizationId" IS NULL
                          OR item."organizationId" = CURRENT_SETTING('app.current_organization_id', true)
                      )
                )
            );
    END IF;
END $$;

COMMENT ON TABLE "cms"."cms_sites"
    IS 'A tenant website. Tenancy is the scalar organizationId column; no foreign key crosses the cms schema boundary.';
COMMENT ON TABLE "cms"."cms_catalog_items"
    IS 'Website Builder catalog item (section, template or theme). Global rows (organizationId IS NULL) are readable by every tenant; administration belongs to app_platform.';
COMMENT ON TABLE "cms"."cms_catalog_item_versions"
    IS 'Immutable published catalog snapshots; a tenant sees versions of items it can read.';
