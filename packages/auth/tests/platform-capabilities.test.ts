import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import {
  PLATFORM_CAPABILITY_CACHE_TTL_SECONDS,
  invalidatePlatformCapabilities,
  platformCapabilityCacheKey,
  resolvePlatformCapabilities,
} from "../src/platform/index.js";

const OPERATOR_ID = "op_test_1";

function createFakeRedis(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  const get = vi.fn(async (key: string) => store.get(key) ?? null);
  const set = vi.fn(
    async (key: string, value: string, _mode: string, _ttl: number) => {
      store.set(key, value);
      return "OK";
    }
  );
  const del = vi.fn(async (key: string) => {
    store.delete(key);
    return 1;
  });

  return { redis: { get, set, del } as unknown as Redis, store, get, set, del };
}

function createFakePrisma(
  rows: Array<{ capability: string }> = [
    { capability: "platform:tenants:read" },
    { capability: "platform:audit:read" },
    { capability: "unknown:capability" },
  ]
) {
  const findMany = vi.fn(async () => rows);
  const prisma = {
    operatorCapability: { findMany },
  } as unknown as PrismaClient;
  return { prisma, findMany };
}

describe("@suite/auth - Platform capability resolver", () => {
  it("resolves registered capabilities and filters unknown codes", async () => {
    const { prisma } = createFakePrisma();
    const { redis, set } = createFakeRedis();

    const capabilities = await resolvePlatformCapabilities({
      prisma,
      redis,
      operatorId: OPERATOR_ID,
    });

    expect(capabilities).toEqual([
      "platform:tenants:read",
      "platform:audit:read",
    ]);
    expect(set).toHaveBeenCalledWith(
      platformCapabilityCacheKey(OPERATOR_ID),
      JSON.stringify(["platform:tenants:read", "platform:audit:read"]),
      "EX",
      PLATFORM_CAPABILITY_CACHE_TTL_SECONDS
    );
  });

  it("uses the cache without querying the database", async () => {
    const { prisma, findMany } = createFakePrisma();
    const { redis } = createFakeRedis({
      [platformCapabilityCacheKey(OPERATOR_ID)]: JSON.stringify([
        "platform:tenants:read",
      ]),
    });

    const capabilities = await resolvePlatformCapabilities({
      prisma,
      redis,
      operatorId: OPERATOR_ID,
    });

    expect(capabilities).toEqual(["platform:tenants:read"]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("falls back to the database when the cached payload is invalid", async () => {
    const { prisma, findMany } = createFakePrisma();
    const { redis } = createFakeRedis({
      [platformCapabilityCacheKey(OPERATOR_ID)]: "not-json",
    });

    await expect(
      resolvePlatformCapabilities({ prisma, redis, operatorId: OPERATOR_ID })
    ).resolves.toHaveLength(2);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it("invalidates the cache on grant or revoke", async () => {
    const { redis, del, store } = createFakeRedis({
      [platformCapabilityCacheKey(OPERATOR_ID)]: "[]",
    });

    await invalidatePlatformCapabilities({ redis, operatorId: OPERATOR_ID });

    expect(del).toHaveBeenCalledWith(
      platformCapabilityCacheKey(OPERATOR_ID)
    );
    expect(store.has(platformCapabilityCacheKey(OPERATOR_ID))).toBe(false);
  });

  it("fails closed when the database is unavailable", async () => {
    const findMany = vi.fn(async () => {
      throw new Error("database unavailable");
    });
    const prisma = {
      operatorCapability: { findMany },
    } as unknown as PrismaClient;
    const { redis } = createFakeRedis();

    await expect(
      resolvePlatformCapabilities({ prisma, redis, operatorId: OPERATOR_ID })
    ).rejects.toThrow("database unavailable");
  });
});
