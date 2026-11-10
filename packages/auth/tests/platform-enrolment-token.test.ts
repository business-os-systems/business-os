import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@suite/redis";
import {
  consumeEnrolmentToken,
  createEnrolmentToken,
  ENROLMENT_TOKEN_TTL_SECONDS,
  readEnrolmentToken,
  storeEnrolmentToken,
} from "../src/platform/enrolment-token.js";

interface FakeRedis {
  readonly redis: Redis;
  readonly store: Map<string, string>;
}

function createFakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  const redis = {
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    getdel: vi.fn((key: string) => {
      const value = store.get(key) ?? null;
      store.delete(key);
      return Promise.resolve(value);
    }),
    del: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    eval: vi.fn(
      (...args: [string, number, string, string, string, string, string]) => {
        const [, , operatorKey, prefix, tokenHash, payload] = args;
        const previous = store.get(operatorKey);
        if (previous) store.delete(prefix + previous);
        store.set(prefix + tokenHash, payload);
        store.set(operatorKey, tokenHash);
        return Promise.resolve(1);
      }
    ),
  } as unknown as Redis;
  return { redis, store };
}

describe("@suite/auth - Platform enrolment token storage", () => {
  it("stores only a hash and returns the operator binding", async () => {
    const { redis, store } = createFakeRedis();
    const token = createEnrolmentToken();

    await storeEnrolmentToken({
      redis,
      token,
      payload: { operatorId: "op_1" },
    });

    await expect(readEnrolmentToken(redis, token)).resolves.toEqual({
      operatorId: "op_1",
    });
    expect([...store.keys()].some((key) => key.includes(token))).toBe(false);
    expect(ENROLMENT_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(15 * 60);
  });

  it("consumes the token exactly once", async () => {
    const { redis } = createFakeRedis();
    const token = createEnrolmentToken();
    await storeEnrolmentToken({
      redis,
      token,
      payload: { operatorId: "op_1" },
    });

    await expect(consumeEnrolmentToken(redis, token)).resolves.toEqual({
      operatorId: "op_1",
    });
    await expect(consumeEnrolmentToken(redis, token)).resolves.toBeNull();
  });

  it("invalidates the previous token when a new one is issued", async () => {
    const { redis } = createFakeRedis();
    const first = createEnrolmentToken();
    const second = createEnrolmentToken();
    const payload = { operatorId: "op_1" };
    await storeEnrolmentToken({ redis, token: first, payload });
    await storeEnrolmentToken({ redis, token: second, payload });

    await expect(consumeEnrolmentToken(redis, first)).resolves.toBeNull();
    await expect(consumeEnrolmentToken(redis, second)).resolves.toEqual(
      payload
    );
  });
});

describe("@suite/auth - Platform enrolment token binding", () => {
  it("keeps tokens for different operators independent", async () => {
    const { redis } = createFakeRedis();
    const first = createEnrolmentToken();
    const second = createEnrolmentToken();
    await storeEnrolmentToken({
      redis,
      token: first,
      payload: { operatorId: "op_1" },
    });
    await storeEnrolmentToken({
      redis,
      token: second,
      payload: { operatorId: "op_2" },
    });

    await expect(consumeEnrolmentToken(redis, first)).resolves.toEqual({
      operatorId: "op_1",
    });
    await expect(consumeEnrolmentToken(redis, second)).resolves.toEqual({
      operatorId: "op_2",
    });
  });

  it("returns null for an unknown token", async () => {
    const { redis } = createFakeRedis();
    await expect(readEnrolmentToken(redis, "unknown")).resolves.toBeNull();
    await expect(consumeEnrolmentToken(redis, "unknown")).resolves.toBeNull();
  });
});
