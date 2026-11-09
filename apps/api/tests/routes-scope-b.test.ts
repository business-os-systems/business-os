import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProblemDetails } from "@suite/core";
import { createApp } from "../src/app.js";
import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import { createAuthHeaders } from "./helpers/auth.js";

/**
 * Characterization of the tenant-facing routes before the P2 service
 * extraction: every assertion here pins the response the route produced when
 * it still queried Prisma directly.
 */
vi.mock("../src/services/admin/tenant-access.service.js", () => ({
  readTenantAccessStatus: vi.fn(() => Promise.resolve("ACTIVE")),
  invalidateTenantAccessStatus: vi.fn(() => Promise.resolve(undefined)),
  TENANT_ACCESS_CACHE_PREFIX: "platform:tenant:access",
  TENANT_ACCESS_CACHE_TTL_SECONDS: 60,
}));

const VALIDATION_ERROR_STATUS = 422;
const FORBIDDEN_STATUS = 403;

interface BranchFixture {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  type: string;
  timezone: string;
  nightAuditHour: number;
  currency: string;
  locale: string;
  status: string;
  parentBranchId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function branchFixture(): BranchFixture {
  return {
    id: "br_test_1",
    organizationId: "org_test_1",
    name: "Riverview Main",
    code: "RVM-01",
    type: "HOSPITALITY_LODGING",
    timezone: "Asia/Kolkata",
    nightAuditHour: 4,
    currency: "INR",
    locale: "en",
    status: "ACTIVE",
    parentBranchId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("Branch routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a list request without any tenant context", async () => {
    const headers = await createAuthHeaders();
    const res = await app.request("/api/v1/branches", { headers });

    expect(res.status).toBe(VALIDATION_ERROR_STATUS);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.invalidParams?.[0]?.name).toBe("organizationId");
  });

  it("lists branches for an explicit organizationId filter", async () => {
    const findMany = vi
      .spyOn(prisma.branch, "findMany")
      .mockResolvedValueOnce([branchFixture()] as never);
    const headers = await createAuthHeaders();

    const res = await app.request("/api/v1/branches?organizationId=org_test_1", {
      headers,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: BranchFixture[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe("br_test_1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org_test_1" } })
    );
  });

  it("reads a single branch scoped by the organization header", async () => {
    const findFirst = vi
      .spyOn(prisma.branch, "findFirst")
      .mockResolvedValueOnce(branchFixture() as never);
    const headers = await createAuthHeaders();

    const res = await app.request("/api/v1/branches/br_test_1", {
      headers: { ...headers, "x-organization-id": "org_test_1" },
    });

    expect(res.status).toBe(200);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "br_test_1", organizationId: "org_test_1" },
      })
    );
  });

  it("returns BRANCH_NOT_FOUND when the branch does not exist", async () => {
    vi.spyOn(prisma.branch, "findFirst").mockResolvedValueOnce(null);
    const headers = await createAuthHeaders();

    const res = await app.request("/api/v1/branches/br_missing", {
      headers: { ...headers, "x-organization-id": "org_test_1" },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("BRANCH_NOT_FOUND");
  });
});

describe("Organization write route", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an organization and returns 201 with the created record", async () => {
    const createdOrganization = {
      id: "org_created_1",
      name: "Acme Hospitality",
      slug: "acme-hospitality",
      currency: "INR",
      country: "IN",
      defaultLocale: "en",
      jurisdiction: "IN_DEFAULT",
      customDomain: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const create = vi
      .spyOn(prisma.organization, "create")
      .mockResolvedValueOnce(createdOrganization as never);
    const headers = await createAuthHeaders();

    const res = await app.request("/api/v1/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ name: "Acme Hospitality", slug: "acme-hospitality" }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id).toBe("org_created_1");
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe("Audit log query route", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("paginates audit events with total and totalPages metadata", async () => {
    vi.spyOn(prisma.auditLog, "count").mockResolvedValueOnce(12);
    const findMany = vi
      .spyOn(prisma.auditLog, "findMany")
      .mockResolvedValueOnce([]);
    const headers = await createAuthHeaders();

    const res = await app.request(
      "/api/v1/audit-logs?organizationId=org_test_1&page=2&limit=5&appId=platform.core&action=organization.created",
      { headers }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: unknown[];
      meta: { total: number; page: number; limit: number; totalPages: number };
    };
    expect(body.meta).toEqual({ total: 12, page: 2, limit: 5, totalPages: 3 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 5,
        where: {
          organizationId: "org_test_1",
          appId: "platform.core",
          action: "organization.created",
        },
      })
    );
  });

  it("rejects an audit query without an organizationId", async () => {
    const headers = await createAuthHeaders();
    const res = await app.request("/api/v1/audit-logs", { headers });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: unknown };
    expect(body.success).toBe(false);
  });
});

describe("Auth tenant routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists workspace memberships for a valid session", async () => {
    vi.spyOn(prisma.userOrganization, "findMany").mockResolvedValueOnce([
      {
        organizationId: "org_test_1",
        organization: {
          id: "org_test_1",
          name: "Test Org",
          slug: "test-org",
          metadata: {},
        },
      },
    ] as never);
    vi.spyOn(prisma.userBranchRole, "findMany").mockResolvedValueOnce([
      { organizationId: "org_test_1", role: { name: "Owner" } },
    ] as never);
    const headers = await createAuthHeaders();

    const res = await app.request("/api/v1/auth/tenants", { headers });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tenants: { organizationId: string; role: string }[];
    };
    expect(body.tenants).toEqual([
      {
        organizationId: "org_test_1",
        name: "Test Org",
        slug: "test-org",
        role: "Owner",
        logoUrl: null,
      },
    ]);
  });

  it("rejects a forged session token", async () => {
    const res = await app.request("/api/v1/auth/tenants", {
      headers: { Authorization: "Bearer forged.token.value" },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("refuses to switch into a workspace without an active membership", async () => {
    vi.spyOn(prisma.userOrganization, "findUnique").mockResolvedValueOnce(null);
    const headers = await createAuthHeaders();

    const res = await app.request("/api/v1/auth/switch-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ organizationId: "org_foreign" }),
    });

    expect(res.status).toBe(FORBIDDEN_STATUS);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("FORBIDDEN");
  });
});

describe("Auth terminal PIN routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an invalid terminal PIN payload before touching the database", async () => {
    const res = await app.request("/api/v1/auth/terminal/pin-switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terminalPin: "abc", organizationId: "org_test_1" }),
    });

    expect(res.status).toBe(VALIDATION_ERROR_STATUS);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.invalidParams?.some((p) => p.name === "terminalPin")).toBe(true);
  });

  it("sets a terminal PIN and returns the updated envelope", async () => {
    const updatedMembership = {};
    vi.spyOn(prisma.userOrganization, "update").mockResolvedValueOnce(
      updatedMembership as never
    );
    vi.spyOn(redis, "keys").mockResolvedValueOnce([]);

    const res = await app.request("/api/v1/auth/terminal/pin-set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "usr_1",
        organizationId: "org_test_1",
        newPin: "1234",
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      data: { message: string };
      requestId: string;
    };
    expect(body.success).toBe(true);
    expect(body.data.message).toContain("Terminal shift PIN updated");
    expect(body.requestId).toBeDefined();
  });
});

describe("Auth manager override routes", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an invalid manager override PIN payload before touching the database", async () => {
    const res = await app.request("/api/v1/auth/manager-override/pin-set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "usr_1", newManagerPin: "12" }),
    });

    expect(res.status).toBe(VALIDATION_ERROR_STATUS);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("refuses a manager override when no manager PIN is configured", async () => {
    vi.spyOn(prisma.userOrganization, "findMany").mockResolvedValueOnce([]);

    const res = await app.request("/api/v1/auth/manager-override/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        managerPin: "849201",
        action: "refund.create",
        targetEntityId: "inv_1",
        reason: "Customer refund approved at counter",
        organizationId: "org_test_1",
      }),
    });

    expect(res.status).toBe(FORBIDDEN_STATUS);
    const body = (await res.json()) as ProblemDetails;
    expect(body.code).toBe("PIN_INVALID");
  });
});
