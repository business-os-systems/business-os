import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import { FLAG_ENVIRONMENTS } from "@suite/flags/contracts";

const cacheMocks = vi.hoisted(() => ({
  invalidateFlagCache: vi.fn<
    (redis: unknown, environment: string, flagKey: string) => Promise<void>
  >(),
}));

vi.mock("@suite/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/flags")>();
  return {
    ...actual,
    invalidateFlagCache: cacheMocks.invalidateFlagCache,
  };
});

import { createAdminFlagsService } from "../src/services/admin/flags.service.js";

const CACHE_PROBE_KEY = "pos.cache_probe";
const OPERATOR_EMAIL = "platform@example.com";

const CREATED_FLAG = {
  id: "flag_cache_probe",
  key: CACHE_PROBE_KEY,
  name: "Cache probe",
  description: null,
  environment: FLAG_ENVIRONMENTS[0],
  isEnabled: false,
  defaultEnabled: false,
  owner: OPERATOR_EMAIL,
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  removalTicket: "#224",
  version: 1,
  metadata: null,
  createdAt: new Date("2026-11-04T00:00:00.000Z"),
  updatedAt: new Date("2026-11-04T00:00:00.000Z"),
  rules: [],
};

function fakePrisma(): PrismaClient {
  const transactionClient = {
    featureFlag: { create: vi.fn().mockResolvedValue(CREATED_FLAG) },
    featureFlagAuditLog: { create: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  return {
    $transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) =>
      work(transactionClient)
    ),
  } as unknown as PrismaClient;
}

describe("Flag cache invalidation after commit", () => {
  it("returns the committed flag when Redis invalidation fails", async () => {
    cacheMocks.invalidateFlagCache.mockRejectedValueOnce(
      new Error("redis unavailable")
    );
    const service = createAdminFlagsService(fakePrisma());

    const created = await service.createFlag(
      {
        key: CACHE_PROBE_KEY,
        name: "Cache probe",
        environment: FLAG_ENVIRONMENTS[0],
        owner: OPERATOR_EMAIL,
        expiresAt: "2099-01-01T00:00:00.000Z",
        removalTicket: "#224",
      },
      { operatorId: "operator_probe", requestId: "req_cache_probe" }
    );

    expect(created.key).toBe(CACHE_PROBE_KEY);
    expect(cacheMocks.invalidateFlagCache).toHaveBeenCalledWith(
      expect.anything(),
      FLAG_ENVIRONMENTS[0],
      CACHE_PROBE_KEY
    );
  });
});
