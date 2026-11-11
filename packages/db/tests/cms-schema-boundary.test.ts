import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { Prisma, prisma } from "../src/index.js";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = join(
  PACKAGE_ROOT,
  "prisma/schema/migrations/20261111140000_cms_schema_grants_rls/migration.sql",
);

const enabled = Boolean(process.env.DATABASE_URL);

const CMS_TABLES = [
  "cms_sites",
  "cms_site_settings",
  "cms_site_appearances",
  "cms_domains",
  "cms_pages",
  "cms_page_contents",
  "cms_page_versions",
  "cms_page_comments",
  "cms_collections",
  "cms_collection_items",
  "cms_themes",
  "cms_templates",
  "cms_section_templates",
  "cms_site_seo_settings",
  "cms_site_locales",
  "cms_page_translations",
  "cms_url_redirects",
  "cms_inquiries",
  "cms_inquiry_events",
  "cms_site_analytics_daily",
  "cms_plugin_installations",
  "cms_navigation_menus",
  "cms_audit_trails",
  "cms_catalog_items",
  "cms_catalog_item_versions",
] as const;

const TENANT_FULL_DML = [
  "cms_sites",
  "cms_site_settings",
  "cms_site_appearances",
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
  "cms_inquiries",
  "cms_site_analytics_daily",
  "cms_plugin_installations",
  "cms_navigation_menus",
  "cms_themes",
  "cms_templates",
  "cms_section_templates",
] as const;

const TENANT_APPEND_ONLY = [
  "cms_page_versions",
  "cms_audit_trails",
  "cms_inquiry_events",
] as const;
const TENANT_READ_ONLY = ["cms_catalog_items", "cms_catalog_item_versions"] as const;

interface TablePlacement {
  readonly table_schema: string;
  readonly table_name: string;
}

interface TableGrant {
  readonly relname: string;
  readonly grantee: string;
  readonly privilege_type: string;
}

interface RlsFlag {
  readonly relname: string;
  readonly relrowsecurity: boolean;
  readonly relforcerowsecurity: boolean;
}

interface PolicyRow {
  readonly tablename: string;
  readonly policyname: string;
  readonly roles: string[];
  readonly qual: string | null;
  readonly with_check: string | null;
}

interface ForeignKeyRow {
  readonly source: string;
  readonly target: string;
}

interface FunctionRow {
  readonly proname: string;
  readonly proconfig: string[] | null;
}

interface TypeRow {
  readonly typname: string;
  readonly nspname: string;
}

async function tablePlacements(): Promise<TablePlacement[]> {
  return prisma.$queryRawUnsafe<TablePlacement[]>(
    `SELECT table_schema, table_name
       FROM information_schema.tables
      WHERE table_name = ANY($1::text[])
        AND table_schema IN ('public', 'cms')
      ORDER BY table_name`,
    [...CMS_TABLES],
  );
}

function privilegesFor(
  rows: readonly TableGrant[],
  grantee: string,
  table: string,
): Set<string> {
  return new Set(
    rows
      .filter((row) => row.grantee === grantee && row.relname === table)
      .map((row) => row.privilege_type),
  );
}

async function tableGrants(): Promise<TableGrant[]> {
  return prisma.$queryRawUnsafe<TableGrant[]>(
    `SELECT c.relname,
            CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
            a.privilege_type
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL aclexplode(c.relacl) a
      WHERE n.nspname = 'cms'
        AND c.relkind = 'r'
      ORDER BY c.relname, grantee, a.privilege_type`,
  );
}

const MASKED_SEMICOLON = "\u0000";

function maskSemicolons(sql: string, pattern: RegExp): string {
  return sql.replace(pattern, (segment: string) => segment.replaceAll(";", MASKED_SEMICOLON));
}

/**
 * Semicolons inside a dollar-quoted block or a string literal do not end a
 * statement. Line comments are dropped first so an apostrophe in prose cannot
 * open a phantom literal; the migration contains no "--" inside a literal.
 */
function maskProtectedSemicolons(sql: string): string {
  const withoutBlocks = maskSemicolons(sql, /\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g);
  const withoutComments = withoutBlocks.replace(/--[^\n]*/g, "");
  return maskSemicolons(withoutComments, /'(?:''|[^'])*'/g);
}

function splitStatements(sql: string): string[] {
  return maskProtectedSemicolons(sql)
    .split(";")
    .map((statement) => statement.replaceAll(MASKED_SEMICOLON, ";").trim())
    .filter((statement) => statement !== "");
}

async function executeStatements(
  tx: Prisma.TransactionClient,
  statements: readonly string[],
  index = 0,
): Promise<void> {
  const statement = statements[index];
  if (statement === undefined) {
    return;
  }
  await tx.$executeRawUnsafe(statement);
  await executeStatements(tx, statements, index + 1);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe.skipIf(!enabled)("cms schema placement", () => {
  it("moves every cms table and enum into the cms schema and leaves none in public", async () => {
    const placements = await tablePlacements();
    const schemaByTable = new Map(placements.map((row) => [row.table_name, row.table_schema]));
    for (const table of CMS_TABLES) {
      expect(schemaByTable.get(table), table).toBe("cms");
    }

    const types = await prisma.$queryRawUnsafe<TypeRow[]>(
      `SELECT t.typname, n.nspname
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname LIKE 'Cms%'
          AND t.typtype = 'e'`,
    );
    expect(types).toHaveLength(9);
    for (const type of types) {
      expect(type.nspname, type.typname).toBe("cms");
    }
  });
});

describe.skipIf(!enabled)("cms tenant grants", () => {
  it("grants PUBLIC nothing and grants app_tenant exactly its per-table privileges", async () => {
    const grants = await tableGrants();

    for (const table of CMS_TABLES) {
      expect(
        grants.some((grant) => grant.grantee === "PUBLIC" && grant.relname === table),
        table + " leaks to PUBLIC",
      ).toBe(false);
    }

    const fullDml = new Set(["SELECT", "INSERT", "UPDATE", "DELETE"]);
    for (const table of TENANT_FULL_DML) {
      expect(privilegesFor(grants, "app_tenant", table), table).toEqual(fullDml);
    }

    for (const table of TENANT_APPEND_ONLY) {
      expect(privilegesFor(grants, "app_tenant", table), table).toEqual(
        new Set(["SELECT", "INSERT"]),
      );
    }

    for (const table of TENANT_READ_ONLY) {
      expect(privilegesFor(grants, "app_tenant", table), table).toEqual(new Set(["SELECT"]));
    }
  });

  it("preserves app_platform catalog administration and nothing else", async () => {
    const grants = await tableGrants();
    const platformTables = grants.filter((grant) => grant.grantee === "app_platform");
    expect(new Set(platformTables.map((grant) => grant.relname))).toEqual(
      new Set(["cms_catalog_items", "cms_catalog_item_versions"]),
    );

    expect(privilegesFor(grants, "app_platform", "cms_catalog_items")).toEqual(
      new Set(["SELECT", "INSERT", "UPDATE"]),
    );
    expect(privilegesFor(grants, "app_platform", "cms_catalog_item_versions")).toEqual(
      new Set(["SELECT", "INSERT"]),
    );
  });
});

describe.skipIf(!enabled)("cms privilege boundary", () => {
  it("denies app_tenant every control-plane relation", async () => {
    const denied = await prisma.$queryRawUnsafe<{ table_name: string; allowed: boolean }[]>(
      `SELECT 'platform.operators' AS table_name,
              has_table_privilege('app_tenant', 'platform.operators', 'SELECT') AS allowed
       UNION ALL
       SELECT 'platform.audit_events',
              has_table_privilege('app_tenant', 'platform.audit_events', 'SELECT')
       UNION ALL
       SELECT 'public.system_feature_flags',
              has_table_privilege('app_tenant', 'public.system_feature_flags', 'SELECT')`,
    );
    for (const row of denied) {
      expect(row.allowed, row.table_name).toBe(false);
    }
    const schemaUsage = await prisma.$queryRawUnsafe<{ allowed: boolean }[]>(
      `SELECT has_schema_privilege('app_tenant', 'platform', 'USAGE') AS allowed`,
    );
    expect(schemaUsage[0]?.allowed).toBe(false);
  });
});

describe.skipIf(!enabled)("cms row-level security", () => {
  it("enables and forces RLS with tenant-context policies on every cms table", async () => {
    const flags = await prisma.$queryRawUnsafe<RlsFlag[]>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'cms' AND c.relkind = 'r'`,
    );
    expect(flags).toHaveLength(CMS_TABLES.length);
    for (const flag of flags) {
      expect(flag.relrowsecurity, flag.relname).toBe(true);
      expect(flag.relforcerowsecurity, flag.relname).toBe(true);
    }

    const policies = await prisma.$queryRawUnsafe<PolicyRow[]>(
      `SELECT tablename, policyname, roles::text[], qual, with_check
         FROM pg_policies
        WHERE schemaname = 'cms'`,
    );
    const tablesWithPolicy = new Set(policies.map((policy) => policy.tablename));
    for (const table of CMS_TABLES) {
      expect(tablesWithPolicy.has(table), table).toBe(true);
    }
    for (const policy of policies) {
      if (policy.roles.includes("app_platform")) {
        expect(policy.qual, policy.policyname).toBe("true");
        continue;
      }
      const expression = (policy.qual ?? "") + (policy.with_check ?? "");
      expect(expression, policy.tablename + "." + policy.policyname).toMatch(
        /current_organization_id/,
      );
    }
  });
});

describe.skipIf(!enabled)("cms foreign keys and runtime helpers", () => {
  it("keeps every cms foreign key inside the cms schema", async () => {
    const foreignKeys = await prisma.$queryRawUnsafe<ForeignKeyRow[]>(
      `SELECT conrelid::regclass::text AS source, confrelid::regclass::text AS target
         FROM pg_constraint c
         JOIN pg_class r ON r.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE c.contype = 'f' AND n.nspname = 'cms'`,
    );
    expect(foreignKeys.length).toBeGreaterThan(0);
    for (const foreignKey of foreignKeys) {
      expect(foreignKey.target.startsWith("cms."), foreignKey.source + " -> " + foreignKey.target).toBe(true);
    }
  });

  it("points storefront helpers and the quota view at cms", async () => {
    const functions = await prisma.$queryRawUnsafe<FunctionRow[]>(
      `SELECT proname, proconfig
         FROM pg_proc
        WHERE proname IN (
          'cms_resolve_domain',
          'cms_public_site_organization',
          'cms_purge_expired_inquiries'
        )
        ORDER BY proname`,
    );
    expect(functions).toHaveLength(3);
    for (const row of functions) {
      expect(row.proconfig?.join(","), row.proname).toContain("search_path=pg_catalog, cms");
    }

    const [view] = await prisma.$queryRawUnsafe<{ definition: string }[]>(
      `SELECT pg_get_viewdef('platform.v_tenant_usage', true) AS definition`,
    );
    expect(view?.definition).toMatch(/FROM cms\.cms_pages/);
    expect(view?.definition).toMatch(/FROM cms\.cms_domains/);
    await prisma.$queryRawUnsafe("SELECT * FROM platform.v_tenant_usage LIMIT 1");

    const [resolved] = await prisma.$queryRawUnsafe<{ result: { resolved: boolean } }[]>(
      "SELECT public.cms_resolve_domain('no-such-host.invalid') AS result",
    );
    expect(resolved?.result.resolved).toBe(false);
  });
});

describe.skipIf(!enabled)("cms migration re-run safety", () => {
  it("re-applies its own migration without failing", async () => {
    const statements = splitStatements(readFileSync(MIGRATION, "utf8"));
    expect(statements.length).toBeGreaterThan(40);

    await prisma.$transaction(
      (tx) => executeStatements(tx, statements),
      { timeout: 180_000 },
    );
  }, 180_000);
});
