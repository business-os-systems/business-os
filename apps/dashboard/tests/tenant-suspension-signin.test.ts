import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@suite/db";
import { SESSION_COOKIE_NAME } from "@suite/auth";
import { POST } from "../src/app/api/auth/login/route";

vi.mock("@suite/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    // The refusal is audited before it returns (SCR-007).
    auditLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@suite/auth/password", () => ({
  verifyPassword: vi.fn(async () => true),
}));

vi.mock("@/lib/turnstile", () => ({
  isTurnstileConfigured: () => false,
  verifyTurnstileToken: vi.fn(async () => ({ success: true })),
}));

function loginRequest(): NextRequest {
  return new NextRequest("http://localhost:3001/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "owner@company.com",
      password: "correct-horse-battery-staple",
    }),
  });
}

function userWithOrg(status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") {
  return {
    id: "usr_owner",
    email: "owner@company.com",
    name: "Owner",
    metadata: null,
    accounts: [{ providerId: "credential", password: "hash" }],
    organizations: [
      {
        organization: {
          id: "org_riverview",
          name: "River View Hospitality",
          status,
        },
      },
    ],
    branchRoles: [],
  };
}

describe("Sign-in refusal for a blocked workspace (FR-017)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BETTER_AUTH_SECRET =
      "test-secret-key-that-is-at-least-32-chars-long!";
  });

  it("refuses a suspended workspace with a typed problem", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userWithOrg("SUSPENDED") as never
    );

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; type: string };
    expect(body.code).toBe("TENANT_SUSPENDED");
    expect(body.type).toBe("/errors/tenant-suspended");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("signs a member into their active workspace when another is suspended", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...userWithOrg("SUSPENDED"),
      organizations: [
        { organization: { id: "org_suspended", name: "Suspended", status: "SUSPENDED" } },
        { organization: { id: "org_active", name: "Active", status: "ACTIVE" } },
      ],
    } as never);

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { organizationId: string } };
    expect(body.user.organizationId).toBe("org_active");
    expect(response.headers.get("set-cookie")).toContain(SESSION_COOKIE_NAME);
  });

  it("refuses an archived workspace with a typed problem", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      userWithOrg("ARCHIVED") as never
    );

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string; type: string };
    expect(body.code).toBe("TENANT_ARCHIVED");
    expect(body.type).toBe("/errors/tenant-archived");
  });
});
