import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@suite/db";
import type { Redis } from "@suite/redis";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { createTenantAccessGuard } from "../src/middleware/tenant-access.js";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import { loadPlatformTestEnv } from "./helpers/platform-env.js";

loadPlatformTestEnv();

interface Fakes {
  readonly prisma: PrismaClient;
  readonly redis: Redis;
  readonly queryRaw: ReturnType<typeof vi.fn>;
  readonly cacheGet: ReturnType<typeof vi.fn>;
  readonly cacheSet: ReturnType<typeof vi.fn>;
}

function createFakes(): Fakes {
  const queryRaw = vi.fn();
  const cacheGet = vi.fn();
  const cacheSet = vi.fn();

  return {
    queryRaw,
    cacheGet,
    cacheSet,
    prisma: {
      $queryRaw: queryRaw,
    } as unknown as PrismaClient,
    redis: {
      get: cacheGet,
      set: cacheSet,
      del: vi.fn(),
    } as unknown as Redis,
  };
}

interface GuardVariables {
  organizationId: string;
}

function buildApp(
  organizationId: string | null,
  fakes: Fakes
): Hono<{ Variables: GuardVariables }> {
  const app = new Hono<{ Variables: GuardVariables }>();
  app.use("*", async (c, next) => {
    if (organizationId !== null) {
      c.set("organizationId", organizationId);
    }
    await next();
  });
  app.use(
    "*",
    createTenantAccessGuard({ prisma: fakes.prisma, redis: fakes.redis })
  );
  app.get("/data", (c) => c.text("ok"));
  app.onError(globalErrorHandler);
  return app;
}

describe("Tenant access guard", () => {
  it("allows an active workspace from the cache without a database read", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue("ACTIVE");

    const response = await buildApp("org_active", fakes).request("/data");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(fakes.queryRaw).not.toHaveBeenCalled();
  });

  it("caches a status read for sixty seconds", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue(null);
    fakes.queryRaw.mockResolvedValue([{ status: "ACTIVE" }]);

    const response = await buildApp("org_cache", fakes).request("/data");

    expect(response.status).toBe(200);
    expect(fakes.cacheSet).toHaveBeenCalledWith(
      "platform:tenant:access:org_cache",
      "ACTIVE",
      "EX",
      60
    );
  });

  it("refuses a suspended workspace with a typed problem", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue("SUSPENDED");

    const response = await buildApp("org_suspended", fakes).request("/data");

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; type: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_SUSPENDED);
    expect(body.type).toBe("/errors/tenant-suspended");
  });

  it("refuses an archived workspace with a typed problem", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue("ARCHIVED");

    const response = await buildApp("org_archived", fakes).request("/data");

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; type: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_ARCHIVED);
    expect(body.type).toBe("/errors/tenant-archived");
  });

  it("refuses a workspace that no longer exists", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue(null);
    fakes.queryRaw.mockResolvedValue([]);

    const response = await buildApp("org_missing", fakes).request("/data");

    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_NOT_FOUND);
  });

  it("never trusts a cache value that is not a canonical status", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue("DELETED");
    fakes.queryRaw.mockResolvedValue([{ status: "ACTIVE" }]);

    const response = await buildApp("org_corrupt_cache", fakes).request("/data");

    expect(response.status).toBe(200);
    expect(fakes.queryRaw).toHaveBeenCalled();
  });

  it("denies a workspace whose stored status is not canonical", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockResolvedValue(null);
    fakes.queryRaw.mockResolvedValue([{ status: "DELETED" }]);

    const response = await buildApp("org_bad_status", fakes).request("/data");

    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_NOT_FOUND);
  });

  it("still enforces the database status when the cache is unavailable", async () => {
    const fakes = createFakes();
    fakes.cacheGet.mockRejectedValue(new Error("redis down"));
    fakes.queryRaw.mockResolvedValue([{ status: "SUSPENDED" }]);

    const response = await buildApp("org_no_cache", fakes).request("/data");

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe(PLATFORM_ERROR_CODE.TENANT_SUSPENDED);
  });

  it("passes through a request without an organisation claim", async () => {
    const fakes = createFakes();

    const response = await buildApp(null, fakes).request("/data");

    expect(response.status).toBe(200);
    expect(fakes.cacheGet).not.toHaveBeenCalled();
  });
});