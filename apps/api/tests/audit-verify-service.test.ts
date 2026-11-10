import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import { verifyAuditChain } from "../src/services/admin/audit-query.service.js";

/**
 * The global verifier is proven by the integration suites; this unit test
 * covers the fail-closed branch when the tenant verifier returns no row.
 */
describe("verifyAuditChain tenant report", () => {
  it("fails closed when the tenant verifier returns no row", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValueOnce([
        { verified: true, checkedCount: 1, firstBrokenId: null },
      ])
      .mockResolvedValueOnce([]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaClient;

    await expect(
      verifyAuditChain(prisma, {
        actorId: "operator-1",
        requestId: "req-tenant-chain-unit",
        organizationId: "org-1",
      }),
    ).rejects.toThrow(
      "The tenant audit-chain verification returned no result.",
    );
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
