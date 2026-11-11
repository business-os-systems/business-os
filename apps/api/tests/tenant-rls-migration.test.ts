import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(
  process.cwd(),
  "../../packages/db/prisma/schema/migrations",
);
const CORE_RLS = resolve(
  MIGRATIONS_DIR,
  "20261110120000_tenant_rls_grants_and_flag_projection/migration.sql",
);
const CMS_SCHEMA = resolve(
  MIGRATIONS_DIR,
  "20261111140000_cms_schema_grants_rls/migration.sql",
);

const coreSql = readFileSync(CORE_RLS, "utf8");
const cmsSql = readFileSync(CMS_SCHEMA, "utf8");

const TENANT_TABLES = [
  "branches",
  "user_organizations",
  "cms_sites",
  "cms_pages",
  "cms_domains",
] as const;

const CMS_TENANT_TABLES = [
  "cms_sites",
  "cms_site_settings",
  "cms_domains",
  "cms_pages",
  "cms_page_contents",
  "cms_page_comments",
  "cms_collections",
  "cms_collection_items",
  "cms_site_seo_settings",
  "cms_site_locales",
  "cms_page_translations",
  "cms_url_redirects",
  "cms_site_analytics_daily",
  "cms_plugin_installations",
  "cms_navigation_menus",
] as const;

const CMS_APPEND_ONLY_TABLES = ["cms_page_versions", "cms_audit_trails"] as const;
const CMS_HYBRID_TABLES = ["cms_themes", "cms_templates", "cms_section_templates"] as const;
const CMS_CATALOG_TABLES = ["cms_catalog_items", "cms_catalog_item_versions"] as const;
const CMS_ALL_TABLES = [
  ...CMS_TENANT_TABLES,
  ...CMS_APPEND_ONLY_TABLES,
  ...CMS_HYBRID_TABLES,
  ...CMS_CATALOG_TABLES,
] as const;

describe("Tenant RLS migration (T167/T197)", () => {
  it("sets a lock timeout for forward-only DDL", () => {
    expect(coreSql).toContain("SET lock_timeout = '5s';");
  });

  it("enables row-level security on the tenant-facing tables", () => {
    expect(coreSql).toContain('ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;');
    expect(coreSql).toContain('ALTER TABLE "user_organizations" ENABLE ROW LEVEL SECURITY;');
    expect(coreSql).toContain("ALTER TABLE %I ENABLE ROW LEVEL SECURITY;");
    for (const table of TENANT_TABLES) {
      expect(coreSql, table).toContain("'" + table + "'");
    }
  });

  it("keys every new policy on app.current_organization_id", () => {
    expect(coreSql).toContain("CURRENT_SETTING('app.current_organization_id', true)");
  });

  it("revokes PUBLIC and grants app_tenant its own tenant DML", () => {
    expect(coreSql).toContain('REVOKE ALL ON TABLE "branches" FROM PUBLIC;');
    expect(coreSql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "branches" TO app_tenant;',
    );
    expect(coreSql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_organizations" TO app_tenant;',
    );
    expect(coreSql).toContain("GRANT SELECT, INSERT ON TABLE %I TO app_tenant;");
  });

  it("creates a read-only tenant flag projection without widening the table grant", () => {
    expect(coreSql).toContain('CREATE OR REPLACE VIEW "public"."v_tenant_feature_flags" AS');
    expect(coreSql).toContain(
      'GRANT SELECT ON TABLE "public"."v_tenant_feature_flags" TO app_tenant;',
    );
    expect(coreSql).toContain(
      'REVOKE ALL ON TABLE "public"."v_tenant_feature_flags" FROM app_platform;',
    );
    expect(coreSql).toContain("system_feature_flag_rules");
    expect(coreSql).toContain("'ruleType', r.\"rule_type\"");
    expect(coreSql).toContain("'targetId', r.\"target_id\"");
  });
});

describe("CMS schema migration: placement (#346, DB-1..DB-5)", () => {
  it("sets lock_timeout before the first DDL statement", () => {
    const lockIndex = cmsSql.indexOf("SET lock_timeout = '5s';");
    const schemaIndex = cmsSql.indexOf('CREATE SCHEMA IF NOT EXISTS "cms";');
    expect(lockIndex).toBeGreaterThanOrEqual(0);
    expect(schemaIndex).toBeGreaterThan(lockIndex);
  });

  it("creates the cms schema and moves all 9 enum types and 23 tables into it", () => {
    expect(cmsSql).toContain('CREATE SCHEMA IF NOT EXISTS "cms";');
    expect(cmsSql).toContain("ALTER TYPE %I.%I SET SCHEMA %I");
    for (const type of [
      "CmsSiteStatus",
      "CmsDomainStatus",
      "CmsPageStatus",
      "CmsLocaleStatus",
      "CmsFormSubmissionStatus",
      "CmsRedirectType",
      "CmsCatalogKind",
      "CmsCatalogScope",
      "CmsCatalogStatus",
    ]) {
      expect(cmsSql, type).toContain("'" + type + "'");
    }

    for (const table of CMS_ALL_TABLES) {
      expect(cmsSql, table).toContain(
        'ALTER TABLE IF EXISTS "public"."' + table + '" SET SCHEMA "cms";',
      );
    }
  });

  it("removes the legacy cross-schema foreign keys and adds no new one", () => {
    expect(cmsSql).toContain(
      'DROP CONSTRAINT IF EXISTS "cms_sites_organizationId_fkey"',
    );
    expect(cmsSql).toContain('DROP CONSTRAINT IF EXISTS "cms_sites_branchId_fkey"');
    expect(cmsSql).not.toMatch(/REFERENCES\s+(?:"public"|public)\./);
  });
});

describe("CMS schema migration: grants (#346, DB-2)", () => {
  it("revokes PUBLIC and grants app_tenant per table", () => {
    for (const table of CMS_ALL_TABLES) {
      expect(cmsSql, table).toContain(
        'REVOKE ALL ON TABLE "cms"."' + table + '" FROM PUBLIC;',
      );
      expect(cmsSql, table).toContain(
        'REVOKE ALL ON TABLE "cms"."' + table + '" FROM app_tenant;',
      );
    }

    for (const table of [...CMS_TENANT_TABLES, ...CMS_HYBRID_TABLES]) {
      expect(cmsSql, table).toContain(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "cms"."' + table + '" TO app_tenant;',
      );
    }
    for (const table of CMS_APPEND_ONLY_TABLES) {
      expect(cmsSql, table).toContain(
        'GRANT SELECT, INSERT ON TABLE "cms"."' + table + '" TO app_tenant;',
      );
    }
    for (const table of CMS_CATALOG_TABLES) {
      expect(cmsSql, table).toContain(
        'GRANT SELECT ON TABLE "cms"."' + table + '" TO app_tenant;',
      );
    }
  });

  it("keeps catalog administration on app_platform with the previous grant shape", () => {
    expect(cmsSql).toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE "cms"."cms_catalog_items" TO app_platform;',
    );
    expect(cmsSql).toContain(
      'GRANT SELECT, INSERT ON TABLE "cms"."cms_catalog_item_versions" TO app_platform;',
    );
    expect(cmsSql).not.toContain(
      'ON TABLE "cms"."cms_catalog_items" TO app_platform;\nGRANT DELETE',
    );
  });
});

describe("CMS schema migration: RLS and runtime helpers (#346, FR-058)", () => {
  it("enables and forces RLS, keyed on the tenant context", () => {
    expect(cmsSql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(cmsSql).toContain("FORCE ROW LEVEL SECURITY");
    expect(cmsSql).toContain("CURRENT_SETTING('app.current_organization_id', true)");
    expect(cmsSql).toContain("cms_catalog_items_tenant_read");
    expect(cmsSql).toContain("cms_catalog_item_versions_tenant_read");
  });

  it("keeps global rows readable while write policies stay tenant-owned", () => {
    expect(cmsSql).toContain("'_tenant_and_global'");
    expect(cmsSql).toContain("'_tenant_update'");
    expect(cmsSql).toContain("'_tenant_delete'");
    for (const table of CMS_HYBRID_TABLES) {
      expect(cmsSql, table).toContain("'" + table + "'");
    }
    expect(cmsSql).toContain('"organizationId" IS NULL');
  });

  it("repoints the storefront helpers, the quota view and the one-home-page index", () => {
    expect(cmsSql).toContain("SET search_path = pg_catalog, cms");
    expect(cmsSql).toContain('FROM cms."cms_pages" p');
    expect(cmsSql).toContain('FROM cms."cms_domains" d');
    expect(cmsSql).toContain("cms_pages_one_home_page_per_site_key");
  });

  it("guards every move so the migration is re-run safe", () => {
    expect(cmsSql).toContain("CREATE SCHEMA IF NOT EXISTS");
    expect(cmsSql).toContain('ALTER TABLE IF EXISTS "public"."cms_sites" SET SCHEMA "cms";');
    expect(cmsSql).toContain("IF NOT EXISTS (");
    expect(cmsSql).toContain("pg_policies");
    expect(cmsSql).toContain("DROP CONSTRAINT IF EXISTS");
    expect(cmsSql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(cmsSql).toContain("to_regprocedure");
  });
});
