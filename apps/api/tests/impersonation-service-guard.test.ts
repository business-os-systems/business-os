import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import { ConflictError } from "@suite/core/errors";
import { endImpersonation } from "../src/services/admin/impersonation.service.js";

const TICKET_ID = "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f";

interface SessionStub {
  readonly id: string;
  readonly endedAt: Date | null;
  readonly organizationId: string;
}

function clientWith(updateCount: number, session: SessionStub | null): PrismaClient {
  const transactionClient = {
    impersonationSession: {
      findFirst: vi.fn().mockResolvedValue(session),
      updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
    },
    auditEvent: { create: vi.fn() },
  };

  return {
    $transaction: (work: (client: unknown) => Promise<unknown>) =>
      work(transactionClient),
  } as unknown as PrismaClient;
}

const SESSION: SessionStub = {
  id: "sess_support_probe",
  endedAt: null,
  organizationId: "org_support_probe",
};

describe("Support-session termination guard (FR-047)", () => {
  it("reports a termination that lost the update race as already ended", async () => {
    const prisma = clientWith(0, SESSION);

    await expect(
      endImpersonation(prisma, {
        ticketId: TICKET_ID,
        scope: { kind: "operator", operatorId: "op_support_probe" },
        endedBy: "op_support_probe",
        actorOperatorId: "op_support_probe",
        requestId: "req_support_probe",
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
