import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/v1/settings/roles/route";
import { PATCH, DELETE } from "../src/app/api/v1/settings/roles/[id]/route";
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
    role: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    permission: {
      findMany: vi.fn(),
    },
    rolePermission: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    userBranchRole: {
      count: vi.fn(),
    },
    organizationInvitation: {
      count: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => callback(mockPrisma)),
  };
  return { prisma: mockPrisma };
});

describe("Roles & Capability Permissions API (T086 / T088)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET =
      "test-secret-key-that-is-at-least-32-chars-long!";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseSession: SessionPayload = {
    userId: "usr_admin_1",
    email: "admin@riverview.com",
    userName: "Admin User",
    organizationId: "org_riverview",
    organizationName: "River View Homestay",
    timestamp: Date.now(),
    permissions: [
      PERMISSIONS.CORE.ROLES_READ,
      PERMISSIONS.CORE.ROLES_MANAGE,
      PERMISSIONS.CORE.USERS_READ,
    ],
  };

  const createAuthenticatedRequest = async (
    url: string,
    method: string,
    body?: unknown,
    sessionOverride?: Partial<SessionPayload>
  ) => {
    const payload: SessionPayload = { ...baseSession, ...sessionOverride };
    const rawToken = encodeSessionPayload(payload);
    const signedToken = await signSessionToken(rawToken);

    const headers: Record<string, string> = {
      cookie: `${SESSION_COOKIE_NAME}=${signedToken}`,
    };

    if (body) {
      headers["content-type"] = "application/json";
    }

    return new NextRequest(new URL(url, "http://localhost:3000"), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  describe("GET /api/v1/settings/roles", () => {
    it("returns 403 Forbidden when user lacks roles:read permission", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "GET",
        undefined,
        { permissions: [] }
      );

      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("returns 200 with list of roles and permissions catalog", async () => {
      vi.mocked(prisma.role.findMany).mockResolvedValueOnce([
        {
          id: "role_owner",
          name: "Organization Owner",
          slug: "tenant-owner",
          description: "Full owner",
          isSystem: true,
          organizationId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          permissions: [
            {
              permission: { action: "core:users:read" },
            },
          ],
          branchAssignments: [{ id: "ubr_1" }],
        },
      ] as never);

      vi.mocked(prisma.permission.findMany).mockResolvedValueOnce([
        {
          id: "perm_1",
          appId: "core",
          action: "core:users:read",
          description: "View users",
        },
        {
          id: "perm_2",
          appId: "cms",
          action: "cms:sites:read",
          description: "View sites",
        },
      ] as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "GET"
      );

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.roles).toHaveLength(1);
      expect(json.roles[0].name).toBe("Organization Owner");
      expect(json.roles[0].isSystem).toBe(true);
      expect(json.roles[0].memberCount).toBe(1);
      expect(json.permissions).toHaveLength(2);
      expect(json.permissions.some((p: { appId: string }) => p.appId === "cms")).toBe(true);
      expect(json.permissions.some((p: { appId: string }) => p.appId === "lodging_pms")).toBe(false);
    });
  });

  describe("POST /api/v1/settings/roles", () => {
    it("returns 403 Forbidden when user lacks roles:manage permission", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "POST",
        { name: "Kitchen Lead" },
        { permissions: [PERMISSIONS.CORE.ROLES_READ] }
      );

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("returns 422 Validation Error when role name is missing or too short", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "POST",
        { name: "A" }
      );

      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("returns 409 Conflict when a role with the same slug already exists", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_existing",
        slug: "front-desk",
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "POST",
        { name: "Front Desk" }
      );

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("ROLE_CONFLICT");
    });

    it("creates a custom role and returns 201 with role details", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.permission.findMany).mockResolvedValueOnce([
        { id: "perm_1", action: "core:users:read", appId: "core", description: "Read" },
      ] as never);
      vi.mocked(prisma.role.create).mockResolvedValueOnce({
        id: "role_new_custom",
        name: "Night Auditor",
        slug: "night-auditor",
        description: "Executes 4am rollover",
        isSystem: false,
        organizationId: "org_riverview",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(prisma.rolePermission.createMany).mockResolvedValueOnce({ count: 1 });

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "POST",
        {
          name: "Night Auditor",
          description: "Executes 4am rollover",
          permissionActions: ["core:users:read"],
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.role.name).toBe("Night Auditor");
      expect(json.role.slug).toBe("night-auditor");
      expect(json.role.permissions).toContain("core:users:read");
    });

    it("creates a custom modular role with CMS capabilities", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.permission.findMany).mockResolvedValueOnce([
        { id: "perm_cms_1", action: "cms:sites:read", appId: "cms", description: "View sites" },
        { id: "perm_cms_2", action: "cms:pages:write", appId: "cms", description: "Edit pages" },
      ] as never);
      vi.mocked(prisma.role.create).mockResolvedValueOnce({
        id: "role_web_designer",
        name: "Website Designer",
        slug: "website-designer",
        description: "Designs landing pages and websites",
        isSystem: false,
        organizationId: "org_riverview",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(prisma.rolePermission.createMany).mockResolvedValueOnce({ count: 2 });

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles",
        "POST",
        {
          name: "Website Designer",
          description: "Designs landing pages and websites",
          permissionActions: ["cms:sites:read", "cms:pages:write"],
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.role.name).toBe("Website Designer");
      expect(json.role.slug).toBe("website-designer");
      expect(json.role.permissions).toEqual(["cms:sites:read", "cms:pages:write"]);
    });
  });

  describe("PATCH /api/v1/settings/roles/[id]", () => {
    it("returns 403 Safeguard Protected when attempting to modify a system role", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_system_owner",
        name: "Organization Owner",
        isSystem: true,
        branchAssignments: [],
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles/role_system_owner",
        "PATCH",
        { name: "Modified Owner" }
      );

      const res = await PATCH(req, {
        params: Promise.resolve({ id: "role_system_owner" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SAFEGUARD_VIOLATION");
      expect(json.detail).toContain("Built-in system roles");
    });

    it("successfully updates custom role and synchronizes permissions", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_custom_1",
        name: "Front Desk Agent",
        isSystem: false,
        branchAssignments: [{ id: "ubr_1" }],
      } as never);

      vi.mocked(prisma.role.update).mockResolvedValueOnce({
        id: "role_custom_1",
        name: "Front Desk Lead",
        slug: "front-desk-agent",
        description: "Updated lead",
        isSystem: false,
        organizationId: "org_riverview",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(prisma.permission.findMany).mockResolvedValueOnce([
        { id: "perm_1", action: "core:branches:read", appId: "core", description: "" },
      ] as never);

      vi.mocked(prisma.rolePermission.deleteMany).mockResolvedValueOnce({ count: 2 });
      vi.mocked(prisma.rolePermission.createMany).mockResolvedValueOnce({ count: 1 });

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles/role_custom_1",
        "PATCH",
        {
          name: "Front Desk Lead",
          description: "Updated lead",
          permissionActions: ["core:branches:read"],
        }
      );

      const res = await PATCH(req, {
        params: Promise.resolve({ id: "role_custom_1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.role.name).toBe("Front Desk Lead");
      expect(json.role.permissions).toEqual(["core:branches:read"]);
    });
  });

  describe("DELETE /api/v1/settings/roles/[id]", () => {
    it("returns 403 Safeguard Protected when attempting to delete a system role", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_system_owner",
        name: "Organization Owner",
        isSystem: true,
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles/role_system_owner",
        "DELETE"
      );

      const res = await DELETE(req, {
        params: Promise.resolve({ id: "role_system_owner" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SAFEGUARD_VIOLATION");
    });

    it("returns 409 Conflict when role is currently assigned to team members", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_custom_active",
        name: "Bar Manager",
        isSystem: false,
      } as never);

      vi.mocked(prisma.userBranchRole.count).mockResolvedValueOnce(3);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles/role_custom_active",
        "DELETE"
      );

      const res = await DELETE(req, {
        params: Promise.resolve({ id: "role_custom_active" }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("ROLE_IN_USE");
      expect(json.detail).toContain("currently assigned to 3 team member(s)");
    });

    it("returns 200 when unused custom role is safely deleted", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_unused",
        name: "Old Role",
        isSystem: false,
      } as never);

      vi.mocked(prisma.userBranchRole.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.organizationInvitation.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.role.delete).mockResolvedValueOnce({} as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/roles/role_unused",
        "DELETE"
      );

      const res = await DELETE(req, {
        params: Promise.resolve({ id: "role_unused" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(prisma.role.delete).toHaveBeenCalledWith({
        where: { id: "role_unused" },
      });
    });
  });
});
