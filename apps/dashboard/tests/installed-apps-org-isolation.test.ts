import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  encodeSessionPayload,
  signSessionToken,
  type SessionPayload,
} from "@suite/auth";
import { GET } from "../src/app/api/v1/organizations/[orgId]/installed-apps/route";
import { resetTenantAccessCache } from "../src/lib/tenant-access";

const mocks = vi.hoisted(() => ({
  organizationFindUnique: vi.fn(),
  installedAppFindMany: vi.fn(),
}));

vi.mock("@suite/db", () => ({
  prisma: {
    organization: { findUnique: mocks.organizationFindUnique },
    installedApp: { findMany: mocks.installedAppFindMany },
  },
}));

const problemBodySchema = z.object({
  type: z.string().startsWith("/errors/"),
  title: z.string().min(1),
  status: z.number().int(),
  code: z.string().min(1),
  detail: z.string().min(1),
});

const bodySchema = z.object({
  organizationId: z.string().min(1),
  apps: z.array(z.object({ appId: z.string().min(1), isEnabled: z.boolean() })),
  installedApps: z.array(z.object({ appId: z.string().min(1) })),
});

const OWN_ORGANIZATION_ID = "org_own";
const FOREIGN_ORGANIZATION_ID = "org_foreign";

const baseSession: SessionPayload = {
  userId: "usr_owner_1",
  email: "owner@example.com",
  userName: "Owner",
  organizationId: OWN_ORGANIZATION_ID,
  organizationName: "Own Organization",
  timestamp: Date.now(),
};

const installedAppRow = {
  id: "inst_1",
  organizationId: OWN_ORGANIZATION_ID,
  appId: "sites",
  version: "1.0.0",
  isEnabled: true,
  installedAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  settings: {
    name: "Website Builder",
    title: "Website Builder",
    code: "website-builder",
    description: "Visual canvas studio.",
    href: "/sites",
    iconName: "sites",
  },
};

function endpoint(orgId: string): string {
  return `http://localhost:3001/api/v1/organizations/${orgId}/installed-apps`;
}

async function sessionCookie(session: SessionPayload): Promise<string> {
  const token = await signSessionToken(encodeSessionPayload(session));
  return `${SESSION_COOKIE_NAME}=${token}`;
}

function routeParams(orgId: string): { params: Promise<{ orgId: string }> } {
  return { params: Promise.resolve({ orgId }) };
}

async function readProblem(response: Response) {
  const raw: unknown = await response.json();
  return problemBodySchema.parse(raw);
}

async function readBody(response: Response) {
  const raw: unknown = await response.json();
  return bodySchema.parse(raw);
}

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET =
    "test-secret-key-that-is-at-least-32-chars-long!";
});

beforeEach(() => {
  vi.clearAllMocks();
  resetTenantAccessCache();
  mocks.organizationFindUnique.mockResolvedValue({ status: "ACTIVE" });
  mocks.installedAppFindMany.mockResolvedValue([installedAppRow]);
});

describe("installed-apps tenant session", () => {
  it("rejects an unauthenticated request", async () => {
    const request = new NextRequest(endpoint(OWN_ORGANIZATION_ID), { method: "GET" });

    const response = await GET(request, routeParams(OWN_ORGANIZATION_ID));

    expect(response.status).toBe(401);
    expect((await readProblem(response)).code).toBe("UNAUTHORIZED");
    expect(mocks.installedAppFindMany.mock.calls).toHaveLength(0);
  });

  it("rejects a session with an invalid signature", async () => {
    const forgedCookie = `${SESSION_COOKIE_NAME}=${encodeSessionPayload(baseSession)}.forged`;
    const request = new NextRequest(endpoint(OWN_ORGANIZATION_ID), {
      method: "GET",
      headers: { cookie: forgedCookie },
    });

    const response = await GET(request, routeParams(OWN_ORGANIZATION_ID));

    expect(response.status).toBe(401);
    expect((await readProblem(response)).code).toBe("INVALID_SESSION");
    expect(mocks.installedAppFindMany.mock.calls).toHaveLength(0);
  });
});

describe("installed-apps organization scoping", () => {
  it("returns 404 for another organization's identifier", async () => {
    const request = new NextRequest(endpoint(FOREIGN_ORGANIZATION_ID), {
      method: "GET",
      headers: { cookie: await sessionCookie(baseSession) },
    });

    const response = await GET(request, routeParams(FOREIGN_ORGANIZATION_ID));

    expect(response.status).toBe(404);
    expect((await readProblem(response)).code).toBe("NOT_FOUND");
    expect(mocks.installedAppFindMany.mock.calls).toHaveLength(0);
  });

  it("rejects an invalid organization identifier", async () => {
    const request = new NextRequest(endpoint(OWN_ORGANIZATION_ID), {
      method: "GET",
      headers: { cookie: await sessionCookie(baseSession) },
    });

    const response = await GET(request, routeParams(""));

    expect(response.status).toBe(400);
    expect((await readProblem(response)).code).toBe("VALIDATION_FAILED");
    expect(mocks.installedAppFindMany.mock.calls).toHaveLength(0);
  });

  it("returns 500 when the entitlements query fails", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.installedAppFindMany.mockRejectedValue(new Error("database unavailable"));
    const request = new NextRequest(endpoint(OWN_ORGANIZATION_ID), {
      method: "GET",
      headers: { cookie: await sessionCookie(baseSession) },
    });

    const response = await GET(request, routeParams(OWN_ORGANIZATION_ID));

    expect(response.status).toBe(500);
    expect((await readProblem(response)).code).toBe("INTERNAL_SERVER_ERROR");
    expect(consoleSpy.mock.calls).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it("returns only the session organization's installed apps", async () => {
    const request = new NextRequest(endpoint(OWN_ORGANIZATION_ID), {
      method: "GET",
      headers: { cookie: await sessionCookie(baseSession) },
    });

    const response = await GET(request, routeParams(OWN_ORGANIZATION_ID));

    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.organizationId).toBe(OWN_ORGANIZATION_ID);
    expect(body.apps).toEqual([{ appId: "sites", isEnabled: true }]);
    expect(body.installedApps).toEqual([{ appId: "sites" }]);
    expect(mocks.installedAppFindMany.mock.calls).toEqual([
      [
        {
          where: { organizationId: OWN_ORGANIZATION_ID, isEnabled: true },
          orderBy: { installedAt: "asc" },
        },
      ],
    ]);
  });
});
