import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { PlatformOutboxStore, Redis } from "@suite/redis";
import { createPlatformOutboxDispatcher } from "@suite/redis";
import { TENANT_LIFECYCLE_EVENT_TYPES } from "@suite/core";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));

vi.mock("@suite/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth")>();
  return { ...actual, sendEmail: sendEmailMock };
});

const { createPlatformOutboxHandlers } = await import(
  "../src/workers/platform-outbox.handlers.js"
);
const { buildTenantLifecycleEvent } = await import(
  "../src/services/admin/lifecycle.service.js"
);

interface QueryCarrier {
  readonly sql?: string;
}

function queryText(query: unknown): string {
  const carrier = query as QueryCarrier;
  return typeof carrier.sql === "string" ? carrier.sql : String(query);
}

function createFakes(contacts: readonly string[] = ["owner@tenant.example"]) {
  const cacheDelete = vi.fn();
  const queryRaw = vi.fn(async (query: unknown) => {
    const text = queryText(query);
    if (text.includes("fn_tenant_admin_contacts")) {
      return contacts.map((email) => ({ email }));
    }
    if (text.includes("v_tenant_overview")) {
      return [
        {
          id: "org_restored",
          name: "Restored Tenant",
          slug: "restored-tenant",
          status: "ACTIVE",
          createdAt: new Date(),
          branchCount: 1,
          memberCount: 2,
          installedAppIds: [],
        },
      ];
    }
    return [];
  });

  return {
    cacheDelete,
    queryRaw,
    prisma: { $queryRaw: queryRaw } as unknown as PrismaClient,
    redis: { del: cacheDelete } as unknown as Redis,
  };
}

function createStore(event: {
  readonly id: string;
  readonly eventType: string;
  readonly payload: unknown;
}): PlatformOutboxStore {
  let delivered = false;
  return {
    async claimNext() {
      if (delivered) return null;
      delivered = true;
      return { ...event, attempts: 1 };
    },
    async markDone() {
      return undefined;
    },
    async markRetry() {
      return undefined;
    },
    async markDead() {
      return undefined;
    },
  };
}

function lifecycleEvent(overrides: {
  readonly action: "SUSPEND" | "RESTORE" | "ARCHIVE";
  readonly organizationId: string;
  readonly fromStatus: "ACTIVE" | "SUSPENDED";
  readonly toStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
}) {
  return buildTenantLifecycleEvent({
    lifecycleEventId: "evt_lifecycle",
    action: overrides.action,
    fromStatus: overrides.fromStatus,
    toStatus: overrides.toStatus,
    occurredAt: new Date("2026-11-04T10:00:00.000Z"),
    organizationId: overrides.organizationId,
    operatorId: "op_1",
    requestId: "req_1",
  });
}

describe("Tenant lifecycle event payload", () => {
  const occurredAt = new Date("2026-11-04T10:00:00.000Z");

  it("carries the canonical reason code and never the operator's text", () => {
    const event = buildTenantLifecycleEvent({
      lifecycleEventId: "evt_suspended",
      action: "SUSPEND",
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
      occurredAt,
      organizationId: "org_1",
      operatorId: "op_1",
      requestId: "req_1",
    });

    expect(event.type).toBe(TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND);
    expect(event.data).toEqual({
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
      reasonCode: "OPERATOR_SUSPEND",
    });
    expect(event.occurredAt).toBe("2026-11-04T10:00:00.000Z");
    expect(event.correlationId).toBe("req_1");
  });

  it("omits the reason code on a restore, which carries no justification", () => {
    const event = buildTenantLifecycleEvent({
      lifecycleEventId: "evt_restored",
      action: "RESTORE",
      fromStatus: "SUSPENDED",
      toStatus: "ACTIVE",
      occurredAt,
      organizationId: "org_1",
      operatorId: "op_1",
      requestId: "req_1",
    });

    expect(event.data).toEqual({
      fromStatus: "SUSPENDED",
      toStatus: "ACTIVE",
    });
    expect(event.data).not.toHaveProperty("reasonCode");
  });
});

describe("Platform lifecycle outbox handlers", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ success: true, messageId: "test" });
  });

  it("registers a handler for every lifecycle event type", () => {
    const fakes = createFakes();
    const handlers = createPlatformOutboxHandlers({
      prisma: fakes.prisma,
      redis: fakes.redis,
    });

    expect(Object.keys(handlers).sort()).toEqual(
      Object.values(TENANT_LIFECYCLE_EVENT_TYPES).sort()
    );
  });

  it("invalidates the tenant access cache when a tenant is suspended", async () => {
    const fakes = createFakes();
    const handlers = createPlatformOutboxHandlers({
      prisma: fakes.prisma,
      redis: fakes.redis,
    });
    const event = lifecycleEvent({
      action: "SUSPEND",
      organizationId: "org_suspended",
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
    });

    await handlers[TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND]?.({
      id: "evt_suspend",
      eventType: event.type,
      payload: event,
      attempts: 1,
    });

    expect(fakes.cacheDelete).toHaveBeenCalledWith(
      "platform:tenant:access:org_suspended"
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("notifies every administrator when a tenant is restored", async () => {
    const fakes = createFakes();
    const handlers = createPlatformOutboxHandlers({
      prisma: fakes.prisma,
      redis: fakes.redis,
    });
    const event = lifecycleEvent({
      action: "RESTORE",
      organizationId: "org_restored",
      fromStatus: "SUSPENDED",
      toStatus: "ACTIVE",
    });

    await handlers[TENANT_LIFECYCLE_EVENT_TYPES.RESTORE]?.({
      id: "evt_restore",
      eventType: event.type,
      payload: event,
      attempts: 1,
    });

    expect(fakes.cacheDelete).toHaveBeenCalledWith(
      "platform:tenant:access:org_restored"
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]).toMatchObject({
      to: "owner@tenant.example",
      organizationId: "org_restored",
    });
  });

  it("retries the event when only some administrators were reached", async () => {
    const fakes = createFakes(["first@tenant.example", "second@tenant.example"]);
    const handlers = createPlatformOutboxHandlers({
      prisma: fakes.prisma,
      redis: fakes.redis,
    });
    const event = lifecycleEvent({
      action: "RESTORE",
      organizationId: "org_restored",
      fromStatus: "SUSPENDED",
      toStatus: "ACTIVE",
    });
    sendEmailMock
      .mockResolvedValueOnce({ success: true, messageId: "one" })
      .mockResolvedValueOnce({ success: false, error: "mailbox unavailable" });

    await expect(
      handlers[TENANT_LIFECYCLE_EVENT_TYPES.RESTORE]?.({
        id: "evt_partial",
        eventType: event.type,
        payload: event,
        attempts: 1,
      })
    ).rejects.toThrow("failed for 1 of 2 tenant administrators");
  });

  it("drives the lifecycle handler through the dispatcher", async () => {
    const fakes = createFakes();
    const handlers = createPlatformOutboxHandlers({
      prisma: fakes.prisma,
      redis: fakes.redis,
    });
    const event = lifecycleEvent({
      action: "ARCHIVE",
      organizationId: "org_archived",
      fromStatus: "SUSPENDED",
      toStatus: "ARCHIVED",
    });
    const dispatcher = createPlatformOutboxDispatcher({
      store: createStore({
        id: "evt_dispatch",
        eventType: event.type,
        payload: event,
      }),
      handlers,
    });

    expect(await dispatcher.dispatchOnce()).toBe(true);
    expect(fakes.cacheDelete).toHaveBeenCalledWith(
      "platform:tenant:access:org_archived"
    );
  });

  it("refuses an event that does not match the published contract", async () => {
    const fakes = createFakes();
    const handlers = createPlatformOutboxHandlers({
      prisma: fakes.prisma,
      redis: fakes.redis,
    });

    await expect(
      handlers[TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND]?.({
        id: "evt_malformed",
        eventType: TENANT_LIFECYCLE_EVENT_TYPES.SUSPEND,
        payload: { organizationId: "org_1" },
        attempts: 1,
      })
    ).rejects.toThrow("does not match the lifecycle event contract");
  });
});
