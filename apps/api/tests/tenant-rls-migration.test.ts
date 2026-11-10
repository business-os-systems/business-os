import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "../../packages/db/prisma/schema/migrations/20261110120000_tenant_rls_grants_and_flag_projection/migration.sql",
);

const sql = readFileSync(MIGRATION, "utf8");

const TENANT_TABLES = [
  "branches",
  "user_organizations",
  "cms_sites",
  "cms_pages",
  "cms_domains",
] as const;

describe("Tenant RLS migration (T167/T197)", () => {
  it("sets a lock timeout for forward-only DDL", () => {
    expect(sql).toContain("SET lock_timeout = '5s';");
  });

  it("enables row-level security on the tenant-facing tables", () => {
    expect(sql).toContain('ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE "user_organizations" ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain("ALTER TABLE %I ENABLE ROW LEVEL SECURITY;");
    for (const table of TENANT_TABLES) {
      expect(sql, table).toContain("'" + table + "'");
    }
  });

  it("keys every new policy on app.current_organization_id", () => {
    expect(sql).toContain("CURRENT_SETTING('app.current_organization_id', true)");
  });

  it("revokes PUBLIC and grants app_tenant its own tenant DML", () => {
    expect(sql).toContain('REVOKE ALL ON TABLE "branches" FROM PUBLIC;');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "branches" TO app_tenant;',
    );
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "user_organizations" TO app_tenant;',
    );
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE %I TO app_tenant;");
  });

  it("creates a read-only tenant flag projection without widening the table grant", () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW "public"."v_tenant_feature_flags" AS');
    expect(sql).toContain('GRANT SELECT ON TABLE "public"."v_tenant_feature_flags" TO app_tenant;');
    expect(sql).toContain(
      'REVOKE ALL ON TABLE "public"."v_tenant_feature_flags" FROM app_platform;',
    );
    expect(sql).toContain("system_feature_flag_rules");
    expect(sql).toContain("'ruleType', r.\"rule_type\"");
    expect(sql).toContain("'targetId', r.\"target_id\"");
  });
});
