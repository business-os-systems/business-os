import { describe, expect, it, vi } from "vitest";
import {
  PLATFORM_OUTBOX_MAX_ATTEMPTS,
  createPlatformOutboxDispatcher,
  platformOutboxBackoffMs,
  type PlatformOutboxEvent,
  type PlatformOutboxStore,
} from "../src/index.js";

const NOW = new Date("2026-10-26T10:00:00.000Z");

function createFakeStore(events: PlatformOutboxEvent[]) {
  const pending = [...events];
  const done: string[] = [];
  const retried: Array<{ id: string; availableAt: Date; error: string }> = [];
  const dead: string[] = [];

  const store: PlatformOutboxStore = {
    claimNext: async () => pending.shift() ?? null,
    markDone: async (id) => {
      done.push(id);
    },
    markRetry: async (id, _attempts, availableAt, error) => {
      retried.push({ id, availableAt, error });
    },
    markDead: async (id) => {
      dead.push(id);
    },
  };

  return { store, done, retried, dead };
}

describe("@suite/redis - Platform outbox dispatcher", () => {
  it("dispatches a known event and marks it done", async () => {
    const event: PlatformOutboxEvent = {
      id: "evt_1",
      eventType: "platform.tenant.suspended",
      payload: { organizationId: "org_1" },
      attempts: 1,
    };
    const { store, done } = createFakeStore([event]);
    const handler = vi.fn(async () => {});
    const dispatcher = createPlatformOutboxDispatcher({
      store,
      handlers: { [event.eventType]: handler },
      now: () => NOW,
    });

    await expect(dispatcher.dispatchOnce()).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(event);
    expect(done).toEqual(["evt_1"]);
  });

  it("skips an unknown event type and marks it done", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { store, done } = createFakeStore([
      { id: "evt_2", eventType: "unknown.event", payload: {}, attempts: 1 },
    ]);
    const dispatcher = createPlatformOutboxDispatcher({
      store,
      handlers: {},
      now: () => NOW,
    });

    await expect(dispatcher.dispatchOnce()).resolves.toBe(true);
    expect(done).toEqual(["evt_2"]);
    warn.mockRestore();
  });

  it("retries a failing handler with backoff", async () => {
    const event: PlatformOutboxEvent = {
      id: "evt_3",
      eventType: "platform.tenant.suspended",
      payload: {},
      attempts: 1,
    };
    const { store, retried, dead } = createFakeStore([event]);
    const dispatcher = createPlatformOutboxDispatcher({
      store,
      handlers: {
        [event.eventType]: async () => {
          throw new Error("consumer down");
        },
      },
      now: () => NOW,
    });

    await dispatcher.dispatchOnce();
    expect(retried).toEqual([
      {
        id: "evt_3",
        availableAt: new Date(NOW.getTime() + platformOutboxBackoffMs(1)),
        error: "consumer down",
      },
    ]);
    expect(dead).toEqual([]);
  });

  it("marks an event dead after the maximum attempts", async () => {
    const event: PlatformOutboxEvent = {
      id: "evt_4",
      eventType: "platform.tenant.suspended",
      payload: {},
      attempts: PLATFORM_OUTBOX_MAX_ATTEMPTS,
    };
    const { store, dead, retried } = createFakeStore([event]);
    const dispatcher = createPlatformOutboxDispatcher({
      store,
      handlers: {
        [event.eventType]: async () => {
          throw new Error("still down");
        },
      },
      now: () => NOW,
    });

    await dispatcher.dispatchOnce();
    expect(dead).toEqual(["evt_4"]);
    expect(retried).toEqual([]);
  });

  it("returns false when the outbox is empty", async () => {
    const { store } = createFakeStore([]);
    const dispatcher = createPlatformOutboxDispatcher({
      store,
      handlers: {},
      now: () => NOW,
    });

    await expect(dispatcher.dispatchOnce()).resolves.toBe(false);
  });
});
