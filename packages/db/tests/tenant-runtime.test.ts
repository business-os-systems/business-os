import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getTenantDatabaseUrl } from "../src/env.js";
import {
  disconnectTenantRuntimeClient,
  prisma,
  withTenantContext,
} from "../src/index.js";

const enabled = Boolean(process.env.TENANT_DATABASE_URL);
const SUFFIX = "runtime";
const ORG_A = `org_${SUFFIX}_a`;
const ORG_B = `org_${SUFFIX}_b`;
const BRANCH_A = `branch_${SUFFIX}_a`;
const BRANCH_B = `branch_${SUFFIX}_b`;

beforeAll(async () => {
  if (!enabled) return;
  await prisma.branch.deleteMany({
    where: { organizationId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_A, ORG_B] } },
  });
  await prisma.organization.createMany({
    data: [
      { id: ORG_A, name: "Runtime A", slug: `runtime-a-${SUFFIX}`, currency: "INR", country: "IN" },
      { id: ORG_B, name: "Runtime B", slug: `runtime-b-${SUFFIX}`, currency: "USD", country: "US" },
    ],
  });
  await prisma.branch.createMany({
    data: [
      { id: BRANCH_A, organizationId: ORG_A, code: "RT-A", name: "Runtime A", type: "hotel", nightAuditHour: 4 },
      { id: BRANCH_B, organizationId: ORG_B, code: "RT-B", name: "Runtime B", type: "restaurant", nightAuditHour: 4 },
    ],
  });
});

afterAll(async () => {
  if (!enabled) return;
  await prisma.branch.deleteMany({
    where: { organizationId: { in: [ORG_A, ORG_B] } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: [ORG_A, ORG_B] } },
  });
  await disconnectTenantRuntimeClient();
});

describe("Tenant runtime configuration", () => {
  it("fails closed when the tenant URL is missing", () => {
    vi.stubEnv("TENANT_DATABASE_URL", "");
    expect(() => getTenantDatabaseUrl()).toThrow(/TENANT_DATABASE_URL/);
    vi.unstubAllEnvs();
  });

  it("rejects an empty organization context", async () => {
    await expect(withTenantContext("", async () => 1)).rejects.toThrow(
      /organization id/,
    );
  });
});

describe.skipIf(!enabled)("Tenant runtime identity", () => {
  it("connects as app_tenant and sets the transaction-local organization", async () => {
    const row = await withTenantContext(ORG_A, async (tx) => {
      const user = await tx.$queryRaw<{ user: string }[]>`SELECT current_user AS "user"`;
      const context = await tx.$queryRaw<{ value: string }[]>`
        SELECT current_setting('app.current_organization_id', true) AS value
      `;
      return { user: user[0]?.user, context: context[0]?.value };
    });
    expect(row.user).toBe("app_tenant");
    expect(row.context).toBe(ORG_A);
  });

  it("sees only its own tenant rows through RLS", async () => {
    const rows = await withTenantContext(ORG_A, (tx) =>
      tx.branch.findMany({ select: { id: true } }),
    );
    expect(rows.map((row) => row.id)).toEqual([BRANCH_A]);
  });
});

describe.skipIf(!enabled)("Tenant runtime boundary", () => {
  it("refuses a cross-tenant insert with a row-level security error", async () => {
    await expect(
      withTenantContext(ORG_A, (tx) =>
        tx.branch.create({
          data: {
            organizationId: ORG_B,
            code: "RT-X",
            name: "Cross tenant",
            type: "retail",
            nightAuditHour: 4,
          },
        }),
      ),
    ).rejects.toThrow(/row-level security|42501/i);
  });

  it("reads the tenant feature-flag projection under RLS", async () => {
    const rows = await withTenantContext(ORG_A, (tx) =>
      tx.$queryRaw<{ key: string }[]>`
        SELECT "key" FROM public.v_tenant_feature_flags
      `,
    );
    expect(Array.isArray(rows)).toBe(true);
  });
});
