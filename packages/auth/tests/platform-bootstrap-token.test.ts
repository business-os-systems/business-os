import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@suite/redis";
import {
  consumeBootstrapToken,
  createBootstrapToken,
  readBootstrapToken,
  storeBootstrapToken,
} from "../src/platform/bootstrap-token.js";

function createFakeRedis() {
  const store = new Map<string, string>();
  return {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    getdel: vi.fn(async (key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return value;
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    eval: vi.fn(
      async (
        _script: string,
        _keys: number,
        operatorKey: string,
        prefix: string,
        tokenHash: string,
        payload: string,
        ttl: string
      ) => {
        const previous = store.get(operatorKey);
        if (previous) store.delete(`${prefix}${previous}`);
        store.set(`${prefix}${tokenHash}`, payload);
        store.set(operatorKey, tokenHash);
        void ttl;
        return 1;
      }
    ),
  } as unknown as Redis;
}

describe("@suite/auth - Platform bootstrap token", () => {
  it("stores a hashed token and returns the payload when read", async () => {
    const redis = createFakeRedis();
    const token = createBootstrapToken();

    await storeBootstrapToken({
      redis,
      token,
      payload: { operatorId: "op_1", email: "ops@example.com" },
    });

    await expect(readBootstrapToken(redis, token)).resolves.toEqual({
      operatorId: "op_1",
      email: "ops@example.com",
    });
    expect(redis.get).toHaveBeenCalledWith(
      expect.not.stringContaining(token)
    );
  });

  it("consumes the token exactly once", async () => {
    const redis = createFakeRedis();
    const token = createBootstrapToken();
    await storeBootstrapToken({
      redis,
      token,
      payload: { operatorId: "op_1", email: "ops@example.com" },
    });

    await expect(consumeBootstrapToken(redis, token)).resolves.not.toBeNull();
    await expect(consumeBootstrapToken(redis, token)).resolves.toBeNull();
  });

  it("invalidates the previous link when a new one is issued", async () => {
    const redis = createFakeRedis();
    const first = createBootstrapToken();
    const second = createBootstrapToken();
    const payload = { operatorId: "op_1", email: "ops@example.com" };
    await storeBootstrapToken({ redis, token: first, payload });
    await storeBootstrapToken({ redis, token: second, payload });

    await expect(consumeBootstrapToken(redis, first)).resolves.toBeNull();
    await expect(consumeBootstrapToken(redis, second)).resolves.toEqual(payload);
  });

  it("returns null for an unknown token", async () => {
    const redis = createFakeRedis();
    await expect(readBootstrapToken(redis, "unknown")).resolves.toBeNull();
  });
});
