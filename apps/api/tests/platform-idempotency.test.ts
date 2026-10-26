import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Redis } from "@suite/redis";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import { createIdempotencyMiddleware } from "../src/middleware/idempotency.js";

function createFakeRedis(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
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

  return { redis: { set, get, del } as unknown as Redis, store };
}

type Variables = {
  requestId: string;
  operatorId: string;
};

function createApp(redis: Redis) {
  let calls = 0;
  const app = new Hono<{ Variables: Variables }>();
  app.onError(globalErrorHandler);
  app.use("*", async (c, next) => {
    c.set("operatorId", "op_1");
    await next();
  });
  app.use("/mutate", createIdempotencyMiddleware({ redis }));
  app.post("/mutate", (c) => {
    calls += 1;
    return c.json({ count: calls });
  });
  return { app, calls: () => calls };
}

describe("Platform idempotency middleware", () => {
  it("replays the first response for a repeated key", async () => {
    const { redis } = createFakeRedis();
    const { app, calls } = createApp(redis);

    const first = await app.request("/mutate", {
      method: "POST",
      headers: { "Idempotency-Key": "idem-key-1" },
    });
    const second = await app.request("/mutate", {
      method: "POST",
      headers: { "Idempotency-Key": "idem-key-1" },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("x-idempotent-replay")).toBe("true");
    expect(await second.json()).toEqual({ count: 1 });
    expect(calls()).toBe(1);
  });

  it("requires an idempotency key", async () => {
    const { redis } = createFakeRedis();
    const { app } = createApp(redis);

    const response = await app.request("/mutate", { method: "POST" });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("rejects an in-flight duplicate with 409", async () => {
    const { redis } = createFakeRedis({
      "idempotency:op_1:POST:/mutate:idem-key-2": "PENDING",
    });
    const { app } = createApp(redis);

    const response = await app.request("/mutate", {
      method: "POST",
      headers: { "Idempotency-Key": "idem-key-2" },
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("releases the reservation when the handler fails", async () => {
    const { redis, store } = createFakeRedis();
    const app = new Hono<{ Variables: Variables }>();
    app.onError(globalErrorHandler);
    app.use("*", async (c, next) => {
      c.set("operatorId", "op_1");
      await next();
    });
    app.use("/boom", createIdempotencyMiddleware({ redis }));
    app.post("/boom", () => {
      throw new Error("handler failed");
    });

    const response = await app.request("/boom", {
      method: "POST",
      headers: { "Idempotency-Key": "idem-key-3" },
    });
    expect(response.status).toBe(500);
    expect(store.has("idempotency:op_1:POST:/boom:idem-key-3")).toBe(false);
  });
});
