import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@suite/db";
import {
  appendPlatformAuditEvent,
  PLATFORM_AUDIT_ACTIONS,
} from "@suite/auth/platform";
import { PLATFORM_CAPABILITIES, QUOTA_KEYS } from "@suite/core";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  createPlatformTestClient,
  platformIntegrationTestsEnabled,
} from "../../helpers/platform-db.js";

loadPlatformTestEnv();

const enabled = platformIntegrationTestsEnabled();

/**
 * Metadata for the public functions, used by the privilege test.
 * Adding a function without adding it here fails the suite, which keeps the
 * DB-2 boundary test exhaustive.
 */
const PUBLIC_FUNCTIONS = [
  "fn_set_tenant_status",
  "fn_set_quota_versioned",
  "fn_set_entitlement_versioned",
  "fn_set_app_setting_versioned",
  "fn_tenant_pii",
  "fn_verify_audit_chain",
] as const;

/** Superseded by the versioned functions; owner-only after #229/#230. */
const RETIRED_FUNCTIONS = [
  "fn_set_quota",
  "fn_set_entitlement",
  "fn_set_app_setting",
] as const;

const ROLLBACK = new Error("rollback test transaction");

interface LifecycleRow {
  lifecycleEventId: string;
  fromStatus: string;
  toStatus: string;
}

interface UsageRow {
  resourceKey: string;
  limitValue: bigint;
  unit: string | null;
  isEnforced: boolean;
  currentValue: bigint | null;
  isMeasurable: boolean;
}

interface PiiRow {
  userId: string;
  name: string;
  email: string;
  membershipStatus: string;
}

interface VerifyRow {
  verified: boolean;
  checkedCount: number;
  firstBrokenId: string | null;
}

interface TenantVerifyRow extends VerifyRow {
  organizationId: string;
}

describe.skipIf(!enabled)("Platform audited functions (T016)", () => {
  const suffix = Date.now().toString(36);
  const createdOperatorIds: string[] = [];
  const createdOrgIds: string[] = [];
  let platformPrisma: PrismaClient;
  let ownerPrisma: PrismaClient;

  /**
   * Every mutation runs in a transaction that is rolled back, so the
   * append-only audit chain in the shared development database is never
   * rewritten by the test suite.
   */
  async function withRollback(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await platformPrisma.$transaction(async (tx) => {
        await run(tx);
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) {
        throw error;
      }
    }
  }

  /**
   * The audit chain is global, so an intact-chain assertion cannot rely on the
   * shared development history. The owner rebuilds a chain inside a
   * transaction that is rolled back, keeping the assertion deterministic.
   */
  async function withOwnerRollback(
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<void> {
    try {
      await ownerPrisma.$transaction(async (tx) => {
        await run(tx);
        throw ROLLBACK;
      });
    } catch (error) {
      if (error !== ROLLBACK) {
        throw error;
      }
    }
  }

  async function createOperator(
    capabilities: readonly string[],
  ): Promise<string> {
    const operator = await platformPrisma.platformOperator.create({
      data: {
        email: `audited-fn-${suffix}-${createdOperatorIds.length}@example.com`,
        displayName: "Audited Function Operator",
        status: "ACTIVE",
        mfaEnrolled: true,
      },
    });
    createdOperatorIds.push(operator.id);
    for (const capability of capabilities) {
      await platformPrisma.operatorCapability.create({
        data: { operatorId: operator.id, capability },
      });
    }
    return operator.id;
  }

  async function createTenant(label: string): Promise<string> {
    const organization = await ownerPrisma.organization.create({
      data: {
        name: `Audited ${label} ${suffix}`,
        slug: `audited-${label}-${suffix}`,
      },
    });
    createdOrgIds.push(organization.id);
    return organization.id;
  }

  beforeAll(() => {
    platformPrisma = createPlatformTestClient();
    ownerPrisma = createPlatformOwnerTestClient();
  });

  afterAll(async () => {
    const orgIds = createdOrgIds;
    if (orgIds.length > 0) {
      await ownerPrisma.quota.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await ownerPrisma.auditEvent.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await ownerPrisma.installedApp.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await ownerPrisma.userOrganization.deleteMany({
        where: { organizationId: { in: orgIds } },
      });
      await ownerPrisma.user.deleteMany({
        where: { email: { contains: suffix } },
      });
    }
    if (createdOperatorIds.length > 0) {
      await ownerPrisma.operatorCapability.deleteMany({
        where: { operatorId: { in: createdOperatorIds } },
      });
      await ownerPrisma.platformOperator.deleteMany({
        where: { id: { in: createdOperatorIds } },
      });
    }
    if (orgIds.length > 0) {
      await ownerPrisma.organization.deleteMany({
        where: { id: { in: orgIds } },
      });
    }
    await platformPrisma.$disconnect();
    await ownerPrisma.$disconnect();
  });

  describe("database boundary (DB-2 / XV.2)", () => {
    it("grants EXECUTE to app_platform only, never to app_tenant or PUBLIC", async () => {
      const rows = await ownerPrisma.$queryRaw<
        Array<{
          proname: string;
          platformAllowed: boolean;
          tenantAllowed: boolean;
        }>
      >(Prisma.sql`
        SELECT
          p.proname,
          has_function_privilege('app_platform', p.oid, 'EXECUTE') AS "platformAllowed",
          has_function_privilege('app_tenant', p.oid, 'EXECUTE') AS "tenantAllowed"
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'platform'
          AND p.proname IN (${Prisma.join(PUBLIC_FUNCTIONS)})
      `);

      expect(rows).toHaveLength(PUBLIC_FUNCTIONS.length);
      for (const row of rows) {
        expect(row.platformAllowed, row.proname).toBe(true);
        expect(row.tenantAllowed, row.proname).toBe(false);
      }
    });

    it("retires the unversioned write functions from the platform identity", async () => {
      const rows = await ownerPrisma.$queryRaw<
        {
          proname: string;
          platformAllowed: boolean;
          tenantAllowed: boolean;
          ownerAllowed: boolean;
        }[]
      >(Prisma.sql`
        SELECT
          p.proname,
          has_function_privilege('app_platform', p.oid, 'EXECUTE') AS "platformAllowed",
          has_function_privilege('app_tenant', p.oid, 'EXECUTE') AS "tenantAllowed",
          has_function_privilege(current_user, p.oid, 'EXECUTE') AS "ownerAllowed"
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'platform'
          AND p.proname IN (${Prisma.join(RETIRED_FUNCTIONS)})
      `);

      expect(rows).toHaveLength(RETIRED_FUNCTIONS.length);
      for (const row of rows) {
        expect(row.platformAllowed, row.proname).toBe(false);
        expect(row.tenantAllowed, row.proname).toBe(false);
        expect(row.ownerAllowed, row.proname).toBe(true);
      }

      const [table] = await ownerPrisma.$queryRaw<
        {
          canInsert: boolean;
          canUpdate: boolean;
          canDelete: boolean;
          canTruncate: boolean;
        }[]
      >(Prisma.sql`
        SELECT
          has_table_privilege('app_platform', 'platform.quotas', 'INSERT') AS "canInsert",
          has_table_privilege('app_platform', 'platform.quotas', 'UPDATE') AS "canUpdate",
          has_table_privilege('app_platform', 'platform.quotas', 'DELETE') AS "canDelete",
          has_table_privilege('app_platform', 'platform.quotas', 'TRUNCATE') AS "canTruncate"
      `);
      expect(table).toEqual({
        canInsert: false,
        canUpdate: false,
        canDelete: false,
        canTruncate: false,
      });
    });

    it("creates no PUBLIC EXECUTE grant on the public functions", async () => {
      const rows = await ownerPrisma.$queryRaw<Array<{ proname: string }>>(
        Prisma.sql`
          SELECT p.proname
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
          WHERE n.nspname = 'platform'
            AND p.proname IN (${Prisma.join(PUBLIC_FUNCTIONS)})
            AND acl.grantee = 0
            AND acl.privilege_type = 'EXECUTE'
        `,
      );

      expect(rows).toEqual([]);
    });

    it("refuses to delete an operator that owns audit history", async () => {
      await expect(
        ownerPrisma.$transaction(async (tx) => {
          const operator = await tx.platformOperator.create({
            data: {
              email: `delete-guard-${suffix}@example.com`,
              displayName: "Delete Guard",
              status: "ACTIVE",
              mfaEnrolled: true,
            },
          });
          await appendPlatformAuditEvent(tx, {
            actorOperatorId: operator.id,
            action: PLATFORM_AUDIT_ACTIONS.TENANT_PII_READ,
            entityType: "Probe",
            entityId: "delete-guard",
            requestId: "req-delete-guard",
          });
          await tx.platformOperator.delete({ where: { id: operator.id } });
        }),
      ).rejects.toThrow(/foreign key/i);
    });
  });

  describe("tenant lifecycle", () => {
    it("applies a transition, records a lifecycle event and audits it", async () => {
      const orgId = await createTenant("lifecycle");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
      ]);

      await withRollback(async (tx) => {
        const rows = await tx.$queryRaw<LifecycleRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"SUSPENDED"}, ${"ACTIVE"}, ${"billing hold"}, ${actorId}, ${"req-lifecycle-1"})`,
        );

        expect(rows[0]?.fromStatus).toBe("ACTIVE");
        expect(rows[0]?.toStatus).toBe("SUSPENDED");

        const events = await tx.$queryRaw<
          Array<{ fromStatus: string; toStatus: string }>
        >(
          Prisma.sql`SELECT "fromStatus", "toStatus" FROM platform.lifecycle_events WHERE "organizationId" = ${orgId}`,
        );
        expect(events).toEqual([
          { fromStatus: "ACTIVE", toStatus: "SUSPENDED" },
        ]);

        const audits = await tx.$queryRaw<
          Array<{ action: string; reason: string }>
        >(
          Prisma.sql`SELECT "action", "reason" FROM platform.audit_events WHERE "organizationId" = ${orgId} AND "action" = ${PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED}`,
        );
        expect(audits).toEqual([
          {
            action: PLATFORM_AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
            reason: "billing hold",
          },
        ]);

        const overview = await tx.$queryRaw<Array<{ status: string }>>(
          Prisma.sql`SELECT "status" FROM platform."v_tenant_overview" WHERE "id" = ${orgId}`,
        );
        expect(overview[0]?.status).toBe("SUSPENDED");
      });
    });

    it("restores a suspended tenant to its previous status", async () => {
      const orgId = await createTenant("restore");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
      ]);

      await withRollback(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"SUSPENDED"}, ${"ACTIVE"}, ${"abuse review"}, ${actorId}, ${"req-restore-1"})`,
        );
        const rows = await tx.$queryRaw<LifecycleRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"ACTIVE"}, ${"SUSPENDED"}, ${"review cleared"}, ${actorId}, ${"req-restore-2"})`,
        );

        expect(rows[0]?.fromStatus).toBe("SUSPENDED");
        expect(rows[0]?.toStatus).toBe("ACTIVE");
      });
    });

    it("refuses an invalid transition", async () => {
      const orgId = await createTenant("invalid");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"ACTIVE"}, ${"ACTIVE"}, ${"no-op"}, ${actorId}, ${"req-invalid-1"})`,
        ),
      ).rejects.toThrow(/INVALID_TRANSITION/);
    });

    it("refuses a stale transition when the observed status moved", async () => {
      const orgId = await createTenant("conflict");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"SUSPENDED"}, ${"TRIAL"}, ${"stale view"}, ${actorId}, ${"req-conflict-1"})`,
        ),
      ).rejects.toThrow(/LIFECYCLE_CONFLICT/);
    });

    it("refuses the change without the lifecycle capability", async () => {
      const orgId = await createTenant("denied");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_READ.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"SUSPENDED"}, ${"ACTIVE"}, ${"denied"}, ${actorId}, ${"req-denied-1"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);
    });

    it("requires a written reason", async () => {
      const orgId = await createTenant("no-reason");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_tenant_status(${orgId}, ${"SUSPENDED"}, ${"ACTIVE"}, ${"   "}, ${actorId}, ${"req-no-reason"})`,
        ),
      ).rejects.toThrow(/VALIDATION_FAILED/);
    });
  });

  describe("quotas and usage", () => {
    it("upserts a quota and audits the before and after values", async () => {
      const orgId = await createTenant("quota");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      ]);

      await withOwnerRollback(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${5n}, ${true}, ${actorId}, ${"req-quota-1"})`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${10n}, ${true}, ${actorId}, ${"req-quota-2"})`,
        );

        const audits = await tx.$queryRaw<
          Array<{ before: unknown; after: unknown; requestId: string }>
        >(
          Prisma.sql`SELECT "before", "after", "requestId" FROM platform.audit_events WHERE "organizationId" = ${orgId} AND "action" = ${PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET}`,
        );

        expect(audits).toHaveLength(2);
        const firstChange = audits.find(
          (row) => row.requestId === "req-quota-1",
        );
        const secondChange = audits.find(
          (row) => row.requestId === "req-quota-2",
        );
        expect(firstChange?.before).toBeNull();
        expect(secondChange?.before).toMatchObject({ limitValue: "5" });
        expect(secondChange?.after).toMatchObject({ limitValue: "10" });
      });
    });

    it("version-guards a quota update and audits it", async () => {
      const orgId = await createTenant("quota-versioned");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      ]);

      const [created] = await ownerPrisma.$queryRaw<{ version: string }[]>(
        Prisma.sql`SELECT * FROM platform.fn_set_quota_versioned(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${5n}, ${true}, ${null}, ${actorId}, ${"req-qv-1"})`,
      );
      if (created === undefined) {
        throw new Error("The versioned quota function returned no row.");
      }

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota_versioned(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${10n}, ${true}, ${"stale"}, ${actorId}, ${"req-qv-stale"})`,
        ),
      ).rejects.toThrow(/QUOTA_CONFLICT/);

      const [updated] = await ownerPrisma.$queryRaw<
        { limitValue: bigint; version: string }[]
      >(
        Prisma.sql`SELECT * FROM platform.fn_set_quota_versioned(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${10n}, ${true}, ${created.version}, ${actorId}, ${"req-qv-2"})`,
      );
      expect(updated?.limitValue).toBe(10n);
      expect(updated?.version).not.toBe(created.version);

      const audits = await ownerPrisma.$queryRaw<
        { requestId: string; before: unknown; after: unknown }[]
      >(
        Prisma.sql`SELECT "requestId", "before", "after" FROM platform.audit_events WHERE "organizationId" = ${orgId} AND "action" = ${PLATFORM_AUDIT_ACTIONS.TENANT_QUOTA_SET} ORDER BY "occurredAt"`,
      );
      expect(audits).toHaveLength(2);
      expect(audits[0]?.before).toBeNull();
      expect(audits[1]?.before).toMatchObject({ limitValue: "5" });
      expect(audits[1]?.after).toMatchObject({ limitValue: "10" });
    });

    it("rejects one of two concurrent creates instead of overwriting", async () => {
      const orgId = await createTenant("quota-create-race");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      ]);

      const create = (limit: bigint) =>
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota_versioned(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${limit}, ${true}, ${null}, ${actorId}, ${"req-qv-race"})`,
        );

      const results = await Promise.allSettled([create(5n), create(10n)]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(String(rejected[0]?.reason)).toMatch(/QUOTA_CONFLICT/);
    });

    it("measures consumption only where a source exists", async () => {
      const orgId = await createTenant("usage");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      ]);
      const memberEmail = `usage-member-${suffix}@example.com`;
      const member = await ownerPrisma.user.create({
        data: { email: memberEmail, name: "Usage Member" },
      });
      await ownerPrisma.userOrganization.create({
        data: { userId: member.id, organizationId: orgId, status: "ACTIVE" },
      });

      await withOwnerRollback(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${3n}, ${true}, ${actorId}, ${"req-usage-1"})`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.STORAGE}, ${1024n}, ${false}, ${actorId}, ${"req-usage-2"})`,
        );

        const rows = await tx.$queryRaw<UsageRow[]>(
          Prisma.sql`SELECT "resourceKey", "limitValue", "unit", "isEnforced", "currentValue", "isMeasurable" FROM platform."v_tenant_usage" WHERE "organizationId" = ${orgId} ORDER BY "resourceKey"`,
        );

        expect(rows).toHaveLength(2);
        const members = rows.find(
          (row) => row.resourceKey === QUOTA_KEYS.MEMBERS,
        );
        expect(members?.currentValue).toBe(1n);
        expect(members?.isMeasurable).toBe(true);
        expect(members?.unit).toBe("count");

        const storage = rows.find(
          (row) => row.resourceKey === QUOTA_KEYS.STORAGE,
        );
        expect(storage?.currentValue).toBeNull();
        expect(storage?.isMeasurable).toBe(false);
        expect(storage?.unit).toBe("bytes");
      });
    });

    it("refuses to enforce an unmeasurable storage limit (FR-091)", async () => {
      const orgId = await createTenant("storage-enforced");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      ]);

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.STORAGE}, ${1024n}, ${true}, ${actorId}, ${"req-storage-enforced"})`,
        ),
      ).rejects.toThrow(/VALIDATION_FAILED/);
    });

    it("refuses a quota change without the quota capability", async () => {
      const orgId = await createTenant("quota-denied");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_READ.code,
      ]);

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.MEMBERS}, ${3n}, ${true}, ${actorId}, ${"req-quota-denied"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);
    });

    it("refuses a negative limit", async () => {
      const orgId = await createTenant("negative");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code,
      ]);

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_quota(${orgId}, ${QUOTA_KEYS.PAGES}, ${-1n}, ${true}, ${actorId}, ${"req-negative"})`,
        ),
      ).rejects.toThrow(/VALIDATION_FAILED/);
    });
  });

  describe("entitlements and app settings", () => {
    it("toggles an installed app and audits it", async () => {
      const orgId = await createTenant("entitlement");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
      ]);
      await ownerPrisma.installedApp.create({
        data: { organizationId: orgId, appId: "website-builder" },
      });

      await withOwnerRollback(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ isEnabled: boolean }>>(
          Prisma.sql`SELECT * FROM platform.fn_set_entitlement(${orgId}, ${"website-builder"}, ${false}, ${actorId}, ${"req-ent-1"})`,
        );
        expect(rows[0]?.isEnabled).toBe(false);

        const audits = await tx.$queryRaw<Array<{ action: string }>>(
          Prisma.sql`SELECT "action" FROM platform.audit_events WHERE "organizationId" = ${orgId} AND "action" = ${PLATFORM_AUDIT_ACTIONS.TENANT_ENTITLEMENT_SET}`,
        );
        expect(audits).toHaveLength(1);
      });
    });

    it("reports a missing tenant before the installation lookup", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
      ]);

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_entitlement(${"tenant_missing_probe"}, ${"website-builder"}, ${true}, ${actorId}, ${"req-ent-missing"})`,
        ),
      ).rejects.toThrow(/TENANT_NOT_FOUND/);
    });

    it("refuses an entitlement change without the entitlement capability", async () => {
      const orgId = await createTenant("entitlement-denied");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_READ.code,
      ]);
      await ownerPrisma.installedApp.create({
        data: { organizationId: orgId, appId: "website-builder" },
      });

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_entitlement(${orgId}, ${"website-builder"}, ${false}, ${actorId}, ${"req-ent-denied"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);
    });

    it("refuses to grant an app the tenant does not have", async () => {
      const orgId = await createTenant("unknown-app");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
      ]);

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_entitlement(${orgId}, ${"not-installed"}, ${true}, ${actorId}, ${"req-ent-2"})`,
        ),
      ).rejects.toThrow(/UNKNOWN_APP/);
    });

    it("stores application settings and refuses a non-object payload", async () => {
      const orgId = await createTenant("app-setting");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
      ]);
      await ownerPrisma.installedApp.create({
        data: { organizationId: orgId, appId: "website-builder" },
      });

      await withOwnerRollback(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ settings: unknown }>>(
          Prisma.sql`SELECT * FROM platform.fn_set_app_setting(${orgId}, ${"website-builder"}, ${JSON.stringify({ theme: "dark" })}::jsonb, ${actorId}, ${"req-setting-1"})`,
        );
        expect(rows[0]?.settings).toMatchObject({ theme: "dark" });

        const audits = await tx.$queryRaw<
          Array<{ after: unknown; before: unknown }>
        >(
          Prisma.sql`SELECT "before", "after" FROM platform.audit_events WHERE "organizationId" = ${orgId} AND "action" = ${PLATFORM_AUDIT_ACTIONS.TENANT_APP_SETTING_SET}`,
        );
        expect(audits).toHaveLength(1);
        expect(JSON.stringify(audits[0]?.after)).toContain("settingKeys");
        expect(JSON.stringify(audits[0]?.after)).not.toContain("dark");
      });

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_app_setting(${orgId}, ${"website-builder"}, ${JSON.stringify({ theme: "light" })}::jsonb, ${await createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])}, ${"req-setting-denied"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);

      await expect(
        ownerPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_set_app_setting(${orgId}, ${"website-builder"}, ${"[1,2]"}::jsonb, ${actorId}, ${"req-setting-2"})`,
        ),
      ).rejects.toThrow(/SETTINGS_INVALID/);
    });
  });

  describe("personal data", () => {
    it("returns member contact data with a recorded reason and audits the read", async () => {
      const orgId = await createTenant("pii");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.PII_READ.code,
      ]);
      const memberEmail = `pii-member-${suffix}@example.com`;
      const member = await ownerPrisma.user.create({
        data: { email: memberEmail, name: "Pii Member" },
      });
      await ownerPrisma.userOrganization.create({
        data: { userId: member.id, organizationId: orgId, status: "ACTIVE" },
      });

      // An invited member has never accepted; the read must not expose them.
      const invitedEmail = `pii-invited-${suffix}@example.com`;
      const invited = await ownerPrisma.user.create({
        data: { email: invitedEmail, name: "Invited Member" },
      });
      await ownerPrisma.userOrganization.create({
        data: { userId: invited.id, organizationId: orgId, status: "INVITED" },
      });

      await withRollback(async (tx) => {
        const rows = await tx.$queryRaw<PiiRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_tenant_pii(${orgId}, ${actorId}, ${"support investigation"}, ${"req-pii-1"})`,
        );
        expect(rows).toHaveLength(1);
        expect(rows.some((row) => row.email === invitedEmail)).toBe(false);
        expect(rows[0]?.email).toBe(memberEmail);
        expect(rows[0]?.name).toBe("Pii Member");

        const audits = await tx.$queryRaw<
          Array<{ action: string; reason: string }>
        >(
          Prisma.sql`SELECT "action", "reason" FROM platform.audit_events WHERE "organizationId" = ${orgId} AND "action" = ${PLATFORM_AUDIT_ACTIONS.TENANT_PII_READ}`,
        );
        expect(audits).toEqual([
          {
            action: PLATFORM_AUDIT_ACTIONS.TENANT_PII_READ,
            reason: "support investigation",
          },
        ]);
      });
    });

    it("refuses the read without the elevated capability", async () => {
      const orgId = await createTenant("pii-denied");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_READ.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_tenant_pii(${orgId}, ${actorId}, ${"snooping"}, ${"req-pii-2"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);
    });

    it("requires a reason before any personal data is returned", async () => {
      const orgId = await createTenant("pii-no-reason");
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.PII_READ.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_tenant_pii(${orgId}, ${actorId}, ${""}, ${"req-pii-3"})`,
        ),
      ).rejects.toThrow(/PII_REASON_REQUIRED/);
    });
  });

  describe("audit chain verification", () => {
    it("verifies an intact chain", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.AUDIT_READ.code,
      ]);

      const base = Date.now();

      await withOwnerRollback(async (tx) => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM platform.audit_events`);
        await appendPlatformAuditEvent(tx, {
          action: "CHAIN_PROBE",
          entityType: "Probe",
          entityId: "chain-first",
          requestId: "req-chain-1",
          occurredAt: new Date(base),
        });
        await appendPlatformAuditEvent(tx, {
          action: "CHAIN_PROBE",
          entityType: "Probe",
          entityId: "chain-second",
          requestId: "req-chain-2",
          occurredAt: new Date(base + 1),
        });

        const rows = await tx.$queryRaw<VerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain(${actorId}, ${"req-verify-1"})`,
        );

        expect(rows[0]?.verified).toBe(true);
        expect(rows[0]?.checkedCount).toBe(2);
        expect(rows[0]?.firstBrokenId).toBeNull();

        const audits = await tx.$queryRaw<
          Array<{ action: string; after: unknown }>
        >(
          Prisma.sql`SELECT "action", "after" FROM platform.audit_events WHERE "action" = ${PLATFORM_AUDIT_ACTIONS.AUDIT_CHAIN_VERIFIED}`,
        );
        expect(audits).toHaveLength(1);
        expect(audits[0]?.after).toMatchObject({
          verified: true,
          checkedCount: 2,
        });
      });
    });

    it("keeps the chain ordered when two rows share a timestamp", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.AUDIT_READ.code,
      ]);
      const sameMoment = new Date();

      await withOwnerRollback(async (tx) => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM platform.audit_events`);
        await appendPlatformAuditEvent(tx, {
          action: "CHAIN_TIE",
          entityType: "Probe",
          entityId: "tie-first",
          requestId: "req-tie-1",
          occurredAt: sameMoment,
        });
        await appendPlatformAuditEvent(tx, {
          action: "CHAIN_TIE",
          entityType: "Probe",
          entityId: "tie-second",
          requestId: "req-tie-2",
          occurredAt: sameMoment,
        });

        const distinct = await tx.$queryRaw<Array<{ count: bigint }>>(
          Prisma.sql`SELECT count(DISTINCT "occurredAt")::bigint AS count FROM platform.audit_events`,
        );
        expect(distinct[0]?.count).toBe(2n);

        const rows = await tx.$queryRaw<VerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain(${actorId}, ${"req-verify-2"})`,
        );
        expect(rows[0]?.verified).toBe(true);
        expect(rows[0]?.checkedCount).toBe(2);
      });
    });

    it("detects a tampered row", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.AUDIT_READ.code,
      ]);

      const base = Date.now();

      await withOwnerRollback(async (tx) => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM platform.audit_events`);
        await appendPlatformAuditEvent(tx, {
          action: "CHAIN_PROBE",
          entityType: "Probe",
          entityId: "chain-first",
          requestId: "req-tamper-1",
          occurredAt: new Date(base),
        });
        const second = await appendPlatformAuditEvent(tx, {
          action: "CHAIN_PROBE",
          entityType: "Probe",
          entityId: "chain-second",
          requestId: "req-tamper-2",
          occurredAt: new Date(base + 1),
        });

        await tx.$executeRaw(
          Prisma.sql`UPDATE platform.audit_events SET "action" = 'TAMPERED' WHERE "id" = ${second.id}`,
        );

        const rows = await tx.$queryRaw<VerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain(${actorId}, ${"req-verify-3"})`,
        );

        expect(rows[0]?.verified).toBe(false);
        expect(rows[0]?.firstBrokenId).toBe(second.id);
      });
    });

    interface TwoTenantChainSeed {
      readonly intactTenantId: string;
      readonly tamperedTenantId: string;
      readonly base: number;
    }

    async function seedTwoTenantChain(
      tx: Prisma.TransactionClient,
      seed: TwoTenantChainSeed,
    ): Promise<string> {
      await tx.$executeRaw(Prisma.sql`DELETE FROM platform.audit_events`);

      await appendPlatformAuditEvent(tx, {
        action: "CHAIN_PROBE",
        entityType: "Probe",
        entityId: "intact-first",
        organizationId: seed.intactTenantId,
        requestId: "req-tenant-chain-1",
        occurredAt: new Date(seed.base),
      });
      await appendPlatformAuditEvent(tx, {
        action: "CHAIN_PROBE",
        entityType: "Probe",
        entityId: "intact-second",
        organizationId: seed.intactTenantId,
        requestId: "req-tenant-chain-2",
        occurredAt: new Date(seed.base + 1),
      });
      const tampered = await appendPlatformAuditEvent(tx, {
        action: "CHAIN_PROBE",
        entityType: "Probe",
        entityId: "tampered-first",
        organizationId: seed.tamperedTenantId,
        requestId: "req-tenant-chain-3",
        occurredAt: new Date(seed.base + 2),
      });
      await appendPlatformAuditEvent(tx, {
        action: "CHAIN_PROBE",
        entityType: "Probe",
        entityId: "tampered-second",
        organizationId: seed.tamperedTenantId,
        requestId: "req-tenant-chain-4",
        occurredAt: new Date(seed.base + 3),
      });

      await tx.$executeRaw(
        Prisma.sql`UPDATE platform.audit_events SET "after" = '{"tampered": true}'::jsonb WHERE "id" = ${tampered.id}`,
      );

      return tampered.id;
    }

    it("attributes a tampered row to its tenant while the intact tenant verifies", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.AUDIT_READ.code,
      ]);
      const intactTenantId = await createTenant("chain-intact");
      const tamperedTenantId = await createTenant("chain-tampered");
      const base = Date.now();

      await withOwnerRollback(async (tx) => {
        const tamperedId = await seedTwoTenantChain(tx, {
          intactTenantId,
          tamperedTenantId,
          base,
        });

        const intactRows = await tx.$queryRaw<TenantVerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain_for_tenant(${actorId}, ${intactTenantId}, ${"req-tenant-verify-1"})`,
        );
        expect(intactRows[0]).toMatchObject({
          organizationId: intactTenantId,
          verified: true,
          checkedCount: 2,
          firstBrokenId: null,
        });

        const tamperedRows = await tx.$queryRaw<TenantVerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain_for_tenant(${actorId}, ${tamperedTenantId}, ${"req-tenant-verify-2"})`,
        );
        expect(tamperedRows[0]).toMatchObject({
          organizationId: tamperedTenantId,
          verified: false,
          checkedCount: 2,
          firstBrokenId: tamperedId,
        });

        // The tenant report must never replace or weaken the global walk.
        const globalRows = await tx.$queryRaw<VerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain(${actorId}, ${"req-tenant-verify-3"})`,
        );
        expect(globalRows[0]?.verified).toBe(false);
        expect(globalRows[0]?.firstBrokenId).toBe(tamperedId);
      });
    });

    it("audits tenant verification on the tenant's own chain rows", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.AUDIT_READ.code,
      ]);
      const intactTenantId = await createTenant("chain-audited");
      const tamperedTenantId = await createTenant("chain-audited-tampered");

      await withOwnerRollback(async (tx) => {
        await seedTwoTenantChain(tx, {
          intactTenantId,
          tamperedTenantId,
          base: Date.now(),
        });
        await tx.$queryRaw<TenantVerifyRow[]>(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain_for_tenant(${actorId}, ${intactTenantId}, ${"req-tenant-verify-audit"})`,
        );

        const audits = await tx.$queryRaw<
          { organizationId: string | null; after: unknown }[]
        >(
          Prisma.sql`SELECT "organizationId", "after" FROM platform.audit_events WHERE "action" = ${PLATFORM_AUDIT_ACTIONS.AUDIT_CHAIN_VERIFIED} AND "organizationId" = ${intactTenantId}`,
        );
        expect(audits).toHaveLength(1);
        expect(audits[0]?.after).toMatchObject({
          scope: "tenant",
          verified: true,
          checkedCount: 2,
        });
      });
    });

    it("refuses tenant verification without the audit capability", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_READ.code,
      ]);
      const tenantId = await createTenant("chain-denied");

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain_for_tenant(${actorId}, ${tenantId}, ${"req-tenant-verify-4"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);
    });

    it("refuses verification without the audit capability", async () => {
      const actorId = await createOperator([
        PLATFORM_CAPABILITIES.TENANTS_READ.code,
      ]);

      await expect(
        platformPrisma.$queryRaw(
          Prisma.sql`SELECT * FROM platform.fn_verify_audit_chain(${actorId}, ${"req-verify-4"})`,
        ),
      ).rejects.toThrow(/CAPABILITY_DENIED/);
    });
  });
});
