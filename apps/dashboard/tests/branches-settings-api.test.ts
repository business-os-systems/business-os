import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/v1/settings/branches/route";
import { PATCH } from "../src/app/api/v1/settings/branches/[id]/route";
import {
  signSessionToken,
  encodeSessionPayload,
  SESSION_COOKIE_NAME,
  type SessionPayload,
} from "@suite/auth";
import { PERMISSIONS } from "@suite/core";
import { prisma } from "@suite/db";

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    branch: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    installedApp: {
      findMany: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

describe("Operational Branches Directory & Management API (Issue #155)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET =
      "test-secret-key-that-is-at-least-32-chars-long!";
  });

  const baseSession: SessionPayload = {
    userId: "usr_owner_1",
    email: "owner@company.com",
    userName: "Owner Alice",
    organizationId: "org_riverview",
    organizationName: "River View Hospitality",
    timestamp: Date.now(),
    permissions: [
      PERMISSIONS.CORE.BRANCHES_READ,
      PERMISSIONS.CORE.BRANCHES_WRITE,
    ],
  };

  const mockBranchData = {
    id: "br_manali_01",
    organizationId: "org_riverview",
    name: "River View Manali",
    code: "MANALI-01",
    type: "homestay",
    capabilities: ["lodging", "dining"],
    status: "ACTIVE",
    timezone: "Asia/Kolkata",
    nightAuditHour: 4,
    currency: "INR",
    locale: "en",
    dateFormat: "YYYY-MM-DD",
    timeFormat: "12h",
    taxIdentifier: "02AAAAA0000A1Z5",
    addressId: "addr_1",
    parentBranchId: null,
    metadata: {},
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    address: {
      id: "addr_1",
      streetAddress: "Old Manali Road",
      landmark: "Near Hadimba Temple",
      city: "Manali",
      state: "Himachal Pradesh",
      postalCode: "175131",
      country: "IN",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.branch.findMany).mockResolvedValue([mockBranchData] as never);
    vi.mocked(prisma.branch.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.branch.findUnique).mockResolvedValue(mockBranchData as never);
    vi.mocked(prisma.branch.create).mockResolvedValue(mockBranchData as never);
    vi.mocked(prisma.branch.update).mockResolvedValue(mockBranchData as never);
  });

  async function createSignedRequest(
    url: string,
    options: {
      method?: string;
      body?: unknown;
      session?: SessionPayload | null;
    } = {}
  ): Promise<NextRequest> {
    const { method = "GET", body, session } = options;
    const headers = new Headers();

    if (session) {
      const token = await signSessionToken(encodeSessionPayload(session));
      headers.set("Cookie", `${SESSION_COOKIE_NAME}=${token}`);
    }

    if (body !== undefined) {
      headers.set("Content-Type", "application/json");
      return new NextRequest(url, {
        method,
        headers,
        body: JSON.stringify(body),
      });
    }

    return new NextRequest(url, { method, headers });
  }

  describe("GET /api/v1/settings/branches", () => {
    it("returns 401 UNAUTHORIZED when session cookie is missing", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { session: null }
      );
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
      expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    });

    it("returns 403 FORBIDDEN when user lacks core:branches:read permission", async () => {
      const unprivilegedSession: SessionPayload = {
        ...baseSession,
        permissions: ["some:other:permission"],
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { session: unprivilegedSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
    });

    it("returns 200 with list of organization branches", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { session: baseSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.branches).toBeDefined();
      expect(data.branches.length).toBe(1);
      expect(data.branches[0].code).toBe("MANALI-01");
      expect(prisma.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: "org_riverview",
          }),
        })
      );
    });
  });

  describe("POST /api/v1/settings/branches", () => {
    const validBranchPayload = {
      name: "River View Cafe",
      code: "CAFE-01",
      type: "restaurant",
      capabilities: ["dining"],
      timezone: "Asia/Kolkata",
      nightAuditHour: 4,
    };

    it("returns 401 UNAUTHORIZED when session is missing", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { method: "POST", body: validBranchPayload, session: null }
      );
      const res = await POST(req);

      expect(res.status).toBe(401);
    });

    it("returns 403 FORBIDDEN when user lacks core:branches:write permission", async () => {
      const readOnlySession: SessionPayload = {
        ...baseSession,
        permissions: [PERMISSIONS.CORE.BRANCHES_READ],
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { method: "POST", body: validBranchPayload, session: readOnlySession }
      );
      const res = await POST(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
    });

    it("returns 400 VALIDATION_ERROR when branch name or code fails validation", async () => {
      const invalidPayload = {
        name: "A", // too short
        code: "invalid code with spaces and lowercase!",
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { method: "POST", body: invalidPayload, session: baseSession }
      );
      const res = await POST(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 409 CONFLICT when branch code already exists in this organization", async () => {
      vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce({
        id: "br_existing",
        code: "CAFE-01",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { method: "POST", body: validBranchPayload, session: baseSession }
      );
      const res = await POST(req);

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("BRANCH_CODE_ALREADY_EXISTS");
      expect(data.title).toBe("Branch Code Conflict");
    });

    it("returns 201 and creates branch record with default ACTIVE status", async () => {
      vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.branch.create).mockResolvedValueOnce({
        ...mockBranchData,
        id: "br_cafe_01",
        name: "River View Cafe",
        code: "CAFE-01",
        type: "restaurant",
        capabilities: ["dining"],
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches",
        { method: "POST", body: validBranchPayload, session: baseSession }
      );
      const res = await POST(req);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.code).toBe("CAFE-01");
      expect(data.type).toBe("restaurant");
      expect(prisma.branch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: "org_riverview",
            code: "CAFE-01",
            status: "ACTIVE",
          }),
        })
      );
    });
  });

  describe("PATCH /api/v1/settings/branches/[id]", () => {
    it("returns 404 NOT_FOUND when branch does not exist or belongs to another tenant", async () => {
      vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce(null);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches/br_unknown",
        {
          method: "PATCH",
          body: { name: "Updated Name" },
          session: baseSession,
        }
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: "br_unknown" }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("BRANCH_NOT_FOUND");
    });

    it("returns 400 IMMUTABLE_FIELD when attempting to mutate branch code", async () => {
      vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce(mockBranchData as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches/br_manali_01",
        {
          method: "PATCH",
          body: { code: "NEW-CODE" },
          session: baseSession,
        }
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: "br_manali_01" }) });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("BRANCH_CODE_IMMUTABLE");
    });

    it("returns 200 and updates operational attributes successfully", async () => {
      vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce(mockBranchData as never);
      vi.mocked(prisma.branch.update).mockResolvedValueOnce({
        ...mockBranchData,
        name: "River View Luxury Resort",
        timezone: "Asia/Kolkata",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches/br_manali_01",
        {
          method: "PATCH",
          body: { name: "River View Luxury Resort" },
          session: baseSession,
        }
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: "br_manali_01" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("River View Luxury Resort");
      expect(prisma.branch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "br_manali_01" },
          data: expect.objectContaining({
            name: "River View Luxury Resort",
          }),
        })
      );
    });

    it("returns 200 when executing soft deactivation or archival", async () => {
      vi.mocked(prisma.branch.findFirst).mockResolvedValueOnce(mockBranchData as never);
      vi.mocked(prisma.branch.update).mockResolvedValueOnce({
        ...mockBranchData,
        status: "TEMPORARILY_CLOSED",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/branches/br_manali_01",
        {
          method: "PATCH",
          body: { status: "TEMPORARILY_CLOSED" },
          session: baseSession,
        }
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: "br_manali_01" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("TEMPORARILY_CLOSED");
    });
  });
});
