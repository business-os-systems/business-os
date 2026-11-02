import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import type { PlatformAuthDependencies } from "../src/services/admin/platform-auth.service.js";
import {
  startBootstrap,
  startSignIn,
} from "../src/services/admin/platform-auth.service.js";

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    getdel: vi.fn(async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    }),
  } as unknown as Redis;
}

function dependencies(operatorCount: number): PlatformAuthDependencies {
  return {
    prisma: {
      platformOperator: { count: vi.fn(async () => operatorCount) },
    } as unknown as PrismaClient,
    redis: createFakeRedis(),
    secret: "platform-auth-test-secret-32-characters",
    config: {
      rpID: "localhost",
      rpName: "Business OS Platform",
      origin: "http://localhost:3002",
    },
  };
}

describe("Platform auth service", () => {
  it("refuses sign-in when no operator exists", async () => {
    await expect(startSignIn(dependencies(0))).rejects.toThrow(
      /Sign-in is not available/
    );
  });

  it("creates a discoverable passkey challenge when operators exist", async () => {
    const result = await startSignIn(dependencies(1));

    expect(result.flowId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.options.challenge).toEqual(expect.any(String));
    expect(result.options.allowCredentials).toEqual([]);
  });

  it("refuses an invalid bootstrap token", async () => {
    const deps = dependencies(0);
    await expect(startBootstrap(deps, "invalid-token")).rejects.toThrow(
      /bootstrap link is invalid/
    );
  });
});
