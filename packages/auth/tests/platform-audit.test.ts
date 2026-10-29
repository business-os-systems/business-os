import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  appendPlatformAuditEvent,
  computePlatformAuditHash,
  PLATFORM_AUDIT_LOCK_ID,
} from "../src/platform/audit.js";

const OCCURRED_AT = new Date("2026-10-26T10:00:00.000Z");

interface AuditCreateData {
  id?: string;
  actorOperatorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  organizationId: string | null;
  reason: string | null;
  requestId: string;
  prevHash: string | null;
  recordHash: string;
  occurredAt: Date;
}

function createFakePrisma(previousHash: string | null = null) {
  const executeRaw = vi.fn(async () => 1);
  const findFirst = vi.fn(async () =>
    previousHash === null ? null : { recordHash: previousHash }
  );
  const create = vi.fn(async ({ data }: { data: AuditCreateData }) => ({
    id: "audit_1",
    ...data,
    before: { status: "ACTIVE" },
    after: { status: "SUSPENDED" },
  }));
  const queryRaw = vi.fn(async () => [
    { beforeText: '{"status": "ACTIVE"}', afterText: null },
  ]);
  const update = vi.fn(
    async ({ data }: { data: { recordHash: string } }) => ({
      id: "audit_1",
      recordHash: data.recordHash,
    })
  );

  const tx = {
    $executeRaw: executeRaw,
    $queryRaw: queryRaw,
    auditEvent: { findFirst, create, update },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
      fn(tx)
    ),
  } as unknown as PrismaClient;

  return { prisma, executeRaw, findFirst, create, queryRaw, update };
}

function eventInput() {
  return {
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
  } as const;
}

describe("@suite/auth - Platform audit writer", () => {
  it("takes the advisory lock and chains a new record", async () => {
    const { prisma, executeRaw, create, update } = createFakePrisma(null);

    await appendPlatformAuditEvent(prisma, eventInput());

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(PLATFORM_AUDIT_LOCK_ID).toBe(724001);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prevHash: null,
          recordHash: "PENDING",
          occurredAt: OCCURRED_AT,
        }),
      })
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { recordHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      })
    );
  });

  it("chains the new record to the previous hash", async () => {
    const { prisma, create, update } = createFakePrisma("previous-hash");

    await appendPlatformAuditEvent(prisma, eventInput());

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ prevHash: "previous-hash" }),
      })
    );
    const hash = update.mock.calls[0]?.[0].data.recordHash;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes the database-canonical before and after text", async () => {
    const { prisma, update } = createFakePrisma(null);

    await appendPlatformAuditEvent(prisma, eventInput());

    const expected = await computePlatformAuditHash({
      prevHash: null,
      actorOperatorId: "op_1",
      action: "TENANT_SUSPENDED",
      entityType: "Organization",
      entityId: "org_1",
      organizationId: "org_1",
      beforeText: '{"status": "ACTIVE"}',
      afterText: "",
      reason: "Support request",
      requestId: "req_1",
      occurredAt: OCCURRED_AT,
    });
    expect(update.mock.calls[0]?.[0].data.recordHash).toBe(expected);
  });

  it("produces different hashes when a hashed field changes", async () => {
    const base = {
      prevHash: null,
      actorOperatorId: "op_1",
      action: "TENANT_SUSPENDED",
      entityType: "Organization",
      entityId: "org_1",
      organizationId: "org_1",
      beforeText: "",
      afterText: "",
      reason: null,
      requestId: "req_1",
      occurredAt: OCCURRED_AT,
    };

    const first = await computePlatformAuditHash(base);
    const second = await computePlatformAuditHash({
      ...base,
      beforeText: '{"status": "SUSPENDED"}',
    });

    expect(first).not.toBe(second);
  });
});
