import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@suite/db";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";
import {
  createPlatformOwnerTestClient,
  platformIntegrationTestsEnabled,
} from "../helpers/platform-db.js";
import {
  countTenantOverview,
  listTenantOverview,
} from "../../src/services/admin/tenant-view.service.js";
import { listTenants } from "../../src/services/admin/tenant.service.js";
import {
  AUDIT_PAYLOAD_DISCLOSURE,
  searchAuditEvents,
} from "../../src/services/admin/audit-query.service.js";

loadPlatformTestEnv();

const enabled = platformIntegrationTestsEnabled();
const ORG_COUNT = 1000;
const RUNS = 12;
const prefix = `perf-${Date.now().toString(36)}`;

/**
 * The SLO table measures the list at 10k tenants and the overview at 100. CI
 * seeds 1,000 to keep the suite bounded and asserts the same SLO ceiling; the
 * budget catches a regression in the query path or an index loss, not a
 * production-scale benchmark (OP-3).
 */
function percentile(samples: readonly number[], percentileValue: number): number {
  const sorted = [...samples].sort((first, second) => first - second);
  const index = Math.max(0, Math.ceil(sorted.length * (percentileValue / 100)) - 1);
  return sorted[index] ?? 0;
}

async function measure(work: () => Promise<unknown>): Promise<number[]> {
  await work();
  const samples: number[] = [];
  await Array.from({ length: RUNS }).reduce<Promise<void>>(
    async (previous) => {
      await previous;
      const start = performance.now();
      await work();
      samples.push(performance.now() - start);
    },
    Promise.resolve(),
  );
  return samples;
}

describe.skipIf(!enabled)("Platform performance budgets (T138, OP-3)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createPlatformOwnerTestClient();
    await prisma.organization.createMany({
      data: Array.from({ length: ORG_COUNT }, (_value, index) => ({
        name: `Performance Tenant ${index}`,
        slug: `${prefix}-${index}`,
      })),
      skipDuplicates: true,
    });
  }, 120_000);

  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  }, 120_000);

  it("serves the overview within the 300ms p95 budget", async () => {
    const samples = await measure(async () => {
      await listTenantOverview(prisma, { limit: 50 });
      await countTenantOverview(prisma, {});
    });

    expect(percentile(samples, 95)).toBeLessThan(300);
  });

  it("serves the tenant list within the 400ms p95 budget", async () => {
    const samples = await measure(() => listTenants(prisma, { limit: 25 }));

    expect(percentile(samples, 95)).toBeLessThan(400);
  });

  it("serves audit search within the 3s p90 budget", async () => {
    const samples = await measure(() =>
      searchAuditEvents(prisma, {
        limit: 50,
        disclosure: AUDIT_PAYLOAD_DISCLOSURE.redacted,
      }),
    );

    expect(percentile(samples, 90)).toBeLessThan(3000);
  });
});
