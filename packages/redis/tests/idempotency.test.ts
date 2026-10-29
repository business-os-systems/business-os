import { describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";
import {
  IDEMPOTENCY_PENDING_TTL_SECONDS,
  IDEMPOTENCY_TTL_SECONDS,
  createIdempotencyStore,
} from "../src/index.js";

function createFakeRedis() {
  const store = new Map<string, string>();
  const set = vi.fn(
    async (
      key: string,
      value: string,
      ...args: Array<string | number>
    ) => {
      const nx = args.includes("NX");
      if (nx && store.has(key)) {
        return null;
      }
      store.set(key, value);
      return "OK";
    }
  );
  const get = vi.fn(async (key: string) => store.get(key) ?? null);
  const del = vi.fn(async (key: string) => {
    store.delete(key);
    return 1;
  });

  return { redis: { set, get, del } as unknown as Redis, store, set };
}

describe("@suite/redis - idempotency store", () => {
  it("reserves a new key and reports a concurrent duplicate as pending", async () => {
    const { redis, set } = createFakeRedis();
    const store = createIdempotencyStore(redis);

    await expect(store.reserve("op:POST:/mutate:key")).resolves.toEqual({
      status: "reserved",
    });
    await expect(store.reserve("op:POST:/mutate:key")).resolves.toEqual({
      status: "pending",
    });
    expect(set).toHaveBeenCalledWith(
      "idempotency:op:POST:/mutate:key",
      "PENDING",
      "EX",
      IDEMPOTENCY_PENDING_TTL_SECONDS,
      "NX"
    );
  });

  it("replays a completed response for 24 hours", async () => {
    const { redis } = createFakeRedis();
    const store = createIdempotencyStore(redis);
    const response = {
      status: 201,
      body: JSON.stringify({ id: "evt_1" }),
      headers: { "content-type": "application/json" },
    };

    await store.reserve("op:POST:/mutate:key");
    await store.complete("op:POST:/mutate:key", response);

    await expect(store.reserve("op:POST:/mutate:key")).resolves.toEqual({
      status: "completed",
      response,
    });
    expect(IDEMPOTENCY_TTL_SECONDS).toBe(86_400);
  });

  it("releases a reservation", async () => {
    const { redis, store: rawStore } = createFakeRedis();
    const store = createIdempotencyStore(redis);

    await store.reserve("op:POST:/mutate:key");
    await store.release("op:POST:/mutate:key");

    expect(rawStore.has("idempotency:op:POST:/mutate:key")).toBe(false);
    await expect(store.reserve("op:POST:/mutate:key")).resolves.toEqual({
      status: "reserved",
    });
  });
});
