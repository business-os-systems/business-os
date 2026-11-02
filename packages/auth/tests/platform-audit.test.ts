import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import { appendPlatformAuditEvent } from "../src/platform/audit.js";

const OCCURRED_AT = new Date("2026-10-26T10:00:00.000Z");

function createFakePrisma() {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "audit_1",
    ...data,
    prevHash: "trigger-previous-hash",
    recordHash: "trigger-record-hash",
  }));
  return {
    prisma: { auditEvent: { create } } as unknown as PrismaClient,
    create,
  };
}

describe("@suite/auth - Platform audit writer", () => {
  it("inserts an append-only row and lets the trigger compute the hash", async () => {
    const { prisma, create } = createFakePrisma();

    const created = await appendPlatformAuditEvent(prisma, {
      actorOperatorId: "op_1",
      action: "TENANT_SUSPENDED",
      entityType: "Organization",
      entityId: "org_1",
      organizationId: "org_1",
      before: { status: "ACTIVE" },
      after: { status: "SUSPENDED" },
      reason: "Support request",
      requestId: "req_1",
      occurredAt: OCCURRED_AT,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recordHash: "PENDING",
          occurredAt: OCCURRED_AT,
        }),
      })
    );
    expect(created.recordHash).toBe("trigger-record-hash");
    expect(created.prevHash).toBe("trigger-previous-hash");
  });
});
