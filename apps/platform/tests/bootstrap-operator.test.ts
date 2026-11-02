import { describe, expect, it, vi } from "vitest";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import {
  bootstrapFirstOperator,
  type BootstrapOperatorDependencies,
} from "../src/lib/bootstrap-operator.js";

interface FakeOperator {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly mfaEnrolled: boolean;
}

interface FakeOptions {
  readonly existing?: readonly FakeOperator[];
  readonly passkeyCount?: number;
}

function createPrisma(options: FakeOptions = {}) {
  const created = {
    id: "op_new",
    email: "ops@example.com",
    displayName: "Ops",
  };
  const createMany = vi.fn(async () => ({ count: 0 }));
  const createOperator = vi.fn(async ({ data }: { data: typeof created }) => ({
    ...created,
    displayName: data.displayName,
  }));
  const deleteOperator = vi.fn(async () => undefined);
  const transaction = vi.fn(
    async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        platformOperator: { create: createOperator },
        operatorCapability: { createMany },
      })
  );
  const prisma = {
    platformOperator: {
      findMany: vi.fn(async () => options.existing ?? []),
      delete: deleteOperator,
    },
    operatorPasskey: {
      count: vi.fn(async () => options.passkeyCount ?? 0),
    },
    $transaction: transaction,
  } as unknown as PrismaClient;
  return { prisma, createMany, createOperator, deleteOperator };
}

function createDependencies(prisma: PrismaClient) {
  const storeToken = vi.fn(async () => undefined);
  const appendAudit = vi.fn(async () => undefined as never);
  const deps: BootstrapOperatorDependencies = {
    prisma,
    redis: {} as Redis,
    createToken: () => "bootstrap-token",
    storeToken,
    appendAudit,
  };
  return { deps, storeToken, appendAudit };
}

const invitedOperator: FakeOperator = {
  id: "op_zero",
  email: "ops@example.com",
  displayName: "Operator Zero",
  status: "INVITED",
  mfaEnrolled: false,
};

describe("Platform bootstrap operator", () => {
  it("creates operator zero with every capability and audits the bootstrap", async () => {
    const { prisma, createMany } = createPrisma();
    const { deps, storeToken, appendAudit } = createDependencies(prisma);

    const result = await bootstrapFirstOperator(deps, {
      email: "Ops@Example.com",
      displayName: "Ops",
    });

    expect(result.action).toBe(PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED);
    expect(result.email).toBe("ops@example.com");
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ capability: "platform:tenants:read" }),
        ]),
      })
    );
    const createManyCalls = createMany.mock.calls as unknown as Array<
      [{ data: unknown[] }]
    >;
    expect(createManyCalls[0]?.[0]?.data).toHaveLength(
      Object.values(PLATFORM_CAPABILITIES).length
    );
    expect(storeToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "bootstrap-token",
        payload: { operatorId: "op_new", email: "ops@example.com" },
      })
    );
    expect(appendAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: PLATFORM_AUDIT_ACTIONS.BOOTSTRAPPED,
        entityId: "op_new",
      })
    );
  });

  it("reissues the link for an invited operator with no passkey", async () => {
    const { prisma, createMany } = createPrisma({
      existing: [invitedOperator],
    });
    const { deps, appendAudit } = createDependencies(prisma);

    const result = await bootstrapFirstOperator(deps, {
      email: "ops@example.com",
      displayName: "Ops",
    });

    expect(result.action).toBe(PLATFORM_AUDIT_ACTIONS.BOOTSTRAP_REISSUED);
    expect(createMany).not.toHaveBeenCalled();
    expect(appendAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: PLATFORM_AUDIT_ACTIONS.BOOTSTRAP_REISSUED,
        entityId: "op_zero",
      })
    );
  });

  it("refuses when a second operator already exists", async () => {
    const { prisma } = createPrisma({
      existing: [invitedOperator, { ...invitedOperator, id: "op_two" }],
    });
    const { deps } = createDependencies(prisma);

    await expect(
      bootstrapFirstOperator(deps, {
        email: "ops@example.com",
        displayName: "Ops",
      })
    ).rejects.toThrow(/only for operator zero/);
  });

  it("refuses an invalid operator email before touching the database", async () => {
    const { prisma } = createPrisma();
    const { deps } = createDependencies(prisma);

    await expect(
      bootstrapFirstOperator(deps, { email: "not-an-email", displayName: "Ops" })
    ).rejects.toThrow(/not a valid email/);
    expect(prisma.platformOperator.findMany).not.toHaveBeenCalled();
  });

  it("removes the new operator when the one-time token cannot be stored", async () => {
    const { prisma, deleteOperator } = createPrisma();
    const { deps, storeToken } = createDependencies(prisma);
    storeToken.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      bootstrapFirstOperator(deps, {
        email: "ops@example.com",
        displayName: "Ops",
      })
    ).rejects.toThrow(/redis unavailable/);
    expect(deleteOperator).toHaveBeenCalledWith({ where: { id: "op_new" } });
  });
});
