import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_DATABASE_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  PERMISSIONS,
  PLATFORM_CAPABILITY_CODES,
  PLATFORM_CAPABILITIES,
  QUOTA_RESOURCE_DEFINITIONS,
} from "@suite/core";

/**
 * SQL cannot import TypeScript, so the migrations repeat capability strings,
 * audit action names and quota keys. These assertions fail when either side
 * drifts, which is the only guard a database contract can have.
 */
const SQL_FILES = [
  "../../packages/db/prisma/schema/migrations/20261104120000_platform_audited_functions/migration.sql",
  "../../packages/db/prisma/schema/migrations/20261104130000_audit_chain_integrity/migration.sql",
  "../../packages/db/prisma/schema/migrations/20261104140000_platform_tenant_admin_contacts/migration.sql",
  "../../packages/db/prisma/schema/migrations/20261104150000_platform_notification_contacts_audit/migration.sql",
  "../../deploy/platform/reseal-audit-chain.sql",
].map((relativePath) => resolve(process.cwd(), relativePath));

const sql = SQL_FILES.map((filePath) => readFileSync(filePath, "utf8")).join(
  "\n",
);

const PUBLIC_FUNCTIONS = [
  "fn_set_tenant_status",
  "fn_set_quota",
  "fn_set_entitlement",
  "fn_set_app_setting",
  "fn_tenant_pii",
  "fn_verify_audit_chain",
  "fn_tenant_admin_contacts",
] as const;

/** The notification audience must evaluate the same capability strings as RBAC. */
const ADMIN_PERMISSION_ACTIONS = [
  PERMISSIONS.WILDCARD,
  PERMISSIONS.CORE.ALL,
  PERMISSIONS.CORE.USERS_MANAGE,
] as const;

const CAPABILITIES_USED = [
  PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
  PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
  PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
  PLATFORM_CAPABILITIES.PII_READ.code,
  PLATFORM_CAPABILITIES.AUDIT_READ.code,
] as const;

describe("Platform SQL contract", () => {
  it("reads every SQL file that owns a contract literal", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("writes every database audit action it declares", () => {
    for (const action of PLATFORM_DATABASE_AUDIT_ACTIONS) {
      expect(sql, action).toContain(`'${action}'`);
    }
  });

  it("uses only registered platform capabilities", () => {
    const registered = new Set<string>(PLATFORM_CAPABILITY_CODES);
    for (const capability of CAPABILITIES_USED) {
      expect(registered.has(capability), capability).toBe(true);
      expect(sql, capability).toContain(`'${capability}'`);
    }
  });

  it("measures exactly the quota keys declared measurable", () => {
    const definitions = Object.entries(QUOTA_RESOURCE_DEFINITIONS);

    for (const [key, definition] of definitions) {
      expect(sql, key).toContain(`'${key}'`);

      if (definition.measurable) {
        expect(sql, key).toContain(`WHEN '${key}' THEN (`);
      } else {
        expect(sql, key).not.toContain(`WHEN '${key}' THEN (`);
      }
    }
  });

  it("addresses tenant administrators by the same capability literals as RBAC", () => {
    for (const action of ADMIN_PERMISSION_ACTIONS) {
      expect(sql, action).toContain(`'${action}'`);
    }
  });

  it("declares every public function", () => {
    for (const name of PUBLIC_FUNCTIONS) {
      expect(sql).toContain(`platform.${name}(`);
    }
  });
});
