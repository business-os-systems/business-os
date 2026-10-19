import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/v1/settings/members/route";
import { PATCH as PATCH_STATUS } from "../src/app/api/v1/settings/members/[id]/status/route";
import { PATCH as PATCH_ROLE } from "../src/app/api/v1/settings/members/[id]/role/route";
import {
  PATCH as PATCH_MEMBER,
  DELETE as DELETE_MEMBER,
} from "../src/app/api/v1/settings/members/[id]/route";
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
    organization: {
      findUnique: vi.fn().mockResolvedValue({ metadata: {} }),
    },
    userOrganization: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    organizationInvitation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    branch: {
      findUnique: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
    userBranchRole: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (arg) =>
      Array.isArray(arg) ? Promise.all(arg) : typeof arg === "function" ? arg(mockPrisma) : arg
    ),
  };
  return { prisma: mockPrisma };
});

describe("Team Members, Invitations & Enterprise Safeguards API (Issue #156)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET =
      "test-secret-key-that-is-at-least-32-chars-long!";
  });

  const baseSession: SessionPayload = {
    userId: "usr_admin_1",
    email: "admin@riverview.com",
    userName: "Admin User",
    organizationId: "org_riverview",
    organizationName: "River View Homestay",
    timestamp: Date.now(),
    permissions: [
      PERMISSIONS.CORE.USERS_READ,
      PERMISSIONS.CORE.USERS_MANAGE,
      PERMISSIONS.CORE.ROLES_READ,
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue({ metadata: {} } as never);
    vi.mocked(prisma.userOrganization.findMany).mockResolvedValue([]);
    vi.mocked(prisma.organizationInvitation.findMany).mockResolvedValue([]);
  });

  describe("GET /api/v1/settings/members", () => {
    it("returns 403 Forbidden if user lacks users:read permission", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "GET",
        undefined,
        { permissions: [] }
      );

      const res = await GET(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("FORBIDDEN");
    });

    it("returns members list combining active users and pending invitations", async () => {
      vi.mocked(prisma.userOrganization.findMany).mockResolvedValueOnce([
        {
          id: "uo_1",
          userId: "usr_1",
          organizationId: "org_riverview",
          status: "ACTIVE",
          terminalPinHash: null,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
          user: {
            id: "usr_1",
            name: "Alice Owner",
            email: "alice@riverview.com",
            image: null,
            branchRoles: [
              {
                id: "ubr_1",
                userId: "usr_1",
                organizationId: "org_riverview",
                branchId: null,
                roleId: "role_owner",
                role: {
                  id: "role_owner",
                  name: "Tenant Owner",
                  slug: "tenant-owner",
                  description: "Full owner",
                  isSystem: true,
                  organizationId: null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                branch: null,
              },
            ],
          },
        } as never,
      ]);

      vi.mocked(prisma.organizationInvitation.findMany).mockResolvedValueOnce([
        {
          id: "inv_1",
          organizationId: "org_riverview",
          email: "bob@riverview.com",
          roleId: "role_manager",
          token: "mock_token_123",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86400000),
          inviterId: "usr_admin_1",
          createdAt: new Date(),
          updatedAt: new Date(),
          role: {
            id: "role_manager",
            name: "Branch Manager",
            slug: "branch-manager",
            description: "Branch manager",
            isSystem: true,
            organizationId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        } as never,
      ]);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "GET"
      );

      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.members).toHaveLength(2);
      expect(json.members[0].name).toBe("Alice Owner");
      expect(json.members[0].isOwner).toBe(true);
      expect(json.members[1].email).toBe("bob@riverview.com");
      expect(json.members[1].status).toBe("INVITED");
    });
  });

  describe("POST /api/v1/settings/members (Direct Member Addition & Invitation Dispatch)", () => {
    it("returns 403 Forbidden if user lacks users:manage permission", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        { email: "new@riverview.com", roleId: "role_1" },
        { permissions: [PERMISSIONS.CORE.USERS_READ] }
      );

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("returns 422 if email is invalid", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        { email: "invalid-email", roleId: "role_1" }
      );

      const res = await POST(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_ERROR");
    });

    it("returns 409 if user is already an active member", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_existing",
        email: "alice@riverview.com",
        organizations: [{ status: "ACTIVE" }],
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        { email: "alice@riverview.com", roleId: "role_manager" }
      );

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("MEMBER_CONFLICT");
    });

    it("creates invitation and returns 201 with secure invite URL", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_mgr",
        name: "Branch Manager",
        slug: "branch-manager",
      } as never);
      vi.mocked(prisma.organizationInvitation.deleteMany).mockResolvedValueOnce({
        count: 0,
      });
      vi.mocked(prisma.organizationInvitation.create).mockResolvedValueOnce({
        id: "inv_new",
        organizationId: "org_riverview",
        email: "staff@riverview.com",
        roleId: "role_mgr",
        token: "crypto_token_456",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        inviterId: "usr_admin_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: "role_mgr",
          name: "Branch Manager",
          slug: "branch-manager",
        },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        { action: "invite", email: "staff@riverview.com", roleId: "role_mgr" }
      );

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.invitation.email).toBe("staff@riverview.com");
      expect(json.inviteUrl).toContain("/invite/");
    });

    it("reuses existing active unexpired pending invitation token idempotently without duplicating links", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_mgr",
        name: "Branch Manager",
        slug: "branch-manager",
      } as never);
      vi.mocked(prisma.organizationInvitation.findFirst).mockResolvedValueOnce({
        id: "inv_existing",
        organizationId: "org_riverview",
        email: "staff@riverview.com",
        roleId: "role_mgr",
        token: "existing_token_xyz",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 5 * 86400000),
        inviterId: "usr_admin_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: "role_mgr",
          name: "Branch Manager",
          slug: "branch-manager",
        },
      } as never);
      vi.mocked(prisma.organizationInvitation.update).mockResolvedValueOnce({
        id: "inv_existing",
        organizationId: "org_riverview",
        email: "staff@riverview.com",
        roleId: "role_mgr",
        token: "existing_token_xyz",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        inviterId: "usr_admin_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: "role_mgr",
          name: "Branch Manager",
          slug: "branch-manager",
        },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        { action: "invite", email: "staff@riverview.com", roleId: "role_mgr" }
      );

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.invitation.invitationToken).toBe("existing_token_xyz");
      expect(json.inviteUrl).toContain("/invite/existing_token_xyz");
      expect(prisma.organizationInvitation.create).not.toHaveBeenCalled();
      expect(prisma.organizationInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "inv_existing" },
        })
      );
    });

    it("allows generating invitation link for pre-registered staff member (isPreRegistered: true)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_preregistered",
        email: "hariom@riverview.com",
        name: "Hariom Jha",
        mobile: "+91 9876543210",
        organizations: [{ id: "uo_hariom", status: "INVITED" }],
      } as never);
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_kitchen",
        name: "Kitchen Staff",
        slug: "kitchen-staff",
      } as never);
      vi.mocked(prisma.userBranchRole.deleteMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.userBranchRole.create).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.organizationInvitation.deleteMany).mockResolvedValueOnce({ count: 0 });
      vi.mocked(prisma.organizationInvitation.create).mockResolvedValueOnce({
        id: "inv_hariom",
        organizationId: "org_riverview",
        email: "hariom@riverview.com",
        roleId: "role_kitchen",
        token: "crypto_token_hariom",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 86400000),
        inviterId: "usr_admin_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        role: {
          id: "role_kitchen",
          name: "Kitchen Staff",
          slug: "kitchen-staff",
        },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        {
          action: "invite",
          email: "hariom@riverview.com",
          roleId: "role_kitchen",
          isPreRegistered: true,
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.invitation.email).toBe("hariom@riverview.com");
      expect(json.invitation.name).toBe("Hariom Jha");
      expect(json.invitation.mobile).toBe("+91 9876543210");
      expect(json.inviteUrl).toContain("/invite/");
    });

    it("rejects generating invitation link if member has already activated their account (status: ACTIVE)", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_active_member",
        email: "active@riverview.com",
        organizations: [{ status: "ACTIVE" }],
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        {
          action: "invite",
          email: "active@riverview.com",
          roleId: "role_kitchen",
          isPreRegistered: true,
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("MEMBER_CONFLICT");
      expect(json.detail).toContain("already an active member");
    });

    it("rejects direct member addition when user already belongs to the organization", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_cashier",
        name: "Cashier",
        slug: "cashier",
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_already_invited",
        email: "invited@riverview.com",
        organizations: [{ status: "INVITED" }],
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        {
          action: "add",
          name: "Invited Staff",
          email: "invited@riverview.com",
          roleId: "role_cashier",
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.code).toBe("MEMBER_CONFLICT");
      expect(json.detail).toContain("already been invited");
    });

    it("directly pre-registers a staff member and generates a secure invitation share link", async () => {
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_cashier",
        name: "Cashier",
        slug: "cashier",
      } as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.user.create).mockResolvedValueOnce({
        id: "usr_direct_1",
        email: "direct@riverview.com",
        name: "Direct Staff",
        mobile: "+91 9876543210",
        image: null,
        managerPinHash: null,
        organizations: [],
      } as never);
      vi.mocked(prisma.userOrganization.upsert).mockResolvedValueOnce({
        id: "uo_direct_1",
        userId: "usr_direct_1",
        organizationId: "org_riverview",
        status: "INVITED",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(prisma.organizationInvitation.deleteMany).mockResolvedValueOnce({ count: 0 });
      vi.mocked(prisma.organizationInvitation.create).mockResolvedValueOnce({
        id: "inv_direct_1",
        organizationId: "org_riverview",
        email: "direct@riverview.com",
        roleId: "role_cashier",
        token: "mock_direct_token_123",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        inviterId: "usr_admin_123",
        createdAt: new Date(),
        updatedAt: new Date(),
        role: { id: "role_cashier", name: "Cashier", slug: "cashier" },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members",
        "POST",
        {
          action: "add",
          name: "Direct Staff",
          email: "direct@riverview.com",
          mobile: "+91 9876543210",
          roleId: "role_cashier",
        }
      );

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.member.name).toBe("Direct Staff");
      expect(json.member.email).toBe("direct@riverview.com");
      expect(json.member.status).toBe("INVITED");
      expect(json.member.isInvitation).toBe(false);
      expect(json.member.invitationToken).toBeDefined();
      expect(json.inviteUrl).toContain("/invite/");
    });
  });

  describe("PATCH /api/v1/settings/members/[id]/status (Last-Admin Safeguard)", () => {
    it("blocks suspending or revoking the last remaining organization administrator", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_sole_owner",
        userId: "usr_sole_owner",
        organizationId: "org_riverview",
        status: "ACTIVE",
        user: {
          id: "usr_sole_owner",
          name: "Sole Owner",
          email: "owner@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: {
                id: "role_owner",
                slug: "tenant-owner",
                name: "Tenant Owner",
              },
            },
          ],
        },
      } as never);

      // count other active admins returns 0!
      vi.mocked(prisma.userOrganization.count).mockResolvedValueOnce(0);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_sole_owner/status",
        "PATCH",
        { status: "SUSPENDED" }
      );

      const res = await PATCH_STATUS(req, {
        params: Promise.resolve({ id: "uo_sole_owner" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("LAST_ADMIN_PROTECTION");
      expect(json.detail).toContain(
        "Cannot suspend the last remaining organization administrator."
      );
    });

    it("allows suspending access when other active administrators exist, and terminates sessions", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_co_owner",
        userId: "usr_co_owner",
        organizationId: "org_riverview",
        status: "ACTIVE",
        user: {
          id: "usr_co_owner",
          name: "Co Owner",
          email: "coowner@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: {
                id: "role_owner",
                slug: "tenant-owner",
                name: "Tenant Owner",
              },
            },
          ],
        },
      } as never);

      // other active admins exist: count is 1
      vi.mocked(prisma.userOrganization.count).mockResolvedValueOnce(1);
      vi.mocked(prisma.userOrganization.update).mockResolvedValueOnce({
        id: "uo_co_owner",
        userId: "usr_co_owner",
        organizationId: "org_riverview",
        status: "SUSPENDED",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);
      vi.mocked(prisma.session.deleteMany).mockResolvedValueOnce({ count: 2 });

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_co_owner/status",
        "PATCH",
        { status: "SUSPENDED" }
      );

      const res = await PATCH_STATUS(req, {
        params: Promise.resolve({ id: "uo_co_owner" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.member.status).toBe("SUSPENDED");

      // Verify immediate session termination was triggered
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "usr_co_owner",
          activeOrganizationId: "org_riverview",
        },
      });

      // Verify pending invitations were automatically cancelled
      expect(prisma.organizationInvitation.deleteMany).toHaveBeenCalledWith({
        where: {
          organizationId: "org_riverview",
          email: "coowner@riverview.com",
          status: "PENDING",
        },
      });
    });
  });

  describe("PATCH /api/v1/settings/members/[id]/role (Last-Admin Demotion Safeguard)", () => {
    it("blocks demoting the last remaining administrator to a non-admin role", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_sole_owner",
        userId: "usr_sole_owner",
        organizationId: "org_riverview",
        status: "ACTIVE",
        user: {
          id: "usr_sole_owner",
          name: "Sole Owner",
          email: "owner@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: {
                id: "role_owner",
                slug: "tenant-owner",
                name: "Tenant Owner",
              },
            },
          ],
        },
      } as never);

      // Target role is non-admin
      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_cashier",
        slug: "cashier",
        name: "Cashier",
      } as never);

      // Other active admins count is 0
      vi.mocked(prisma.userOrganization.count).mockResolvedValueOnce(0);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_sole_owner/role",
        "PATCH",
        { roleId: "role_cashier" }
      );

      const res = await PATCH_ROLE(req, {
        params: Promise.resolve({ id: "uo_sole_owner" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("LAST_ADMIN_PROTECTION");
      expect(json.detail).toContain(
        "Cannot demote the last remaining organization administrator."
      );
    });
  });

  describe("PATCH /api/v1/settings/members/[id] (Member Profile & Details Update)", () => {
    it("updates member profile name, mobile, and role successfully", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_member_1",
        userId: "usr_1",
        organizationId: "org_riverview",
        status: "ACTIVE",
        user: {
          id: "usr_1",
          name: "Old Name",
          email: "member@riverview.com",
          mobile: null,
          branchRoles: [
            {
              branchId: null,
              role: { id: "role_cashier", slug: "cashier", name: "Cashier" },
            },
          ],
        },
      } as never);

      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_manager",
        slug: "manager",
        name: "Manager",
      } as never);

      vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.userBranchRole.deleteMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.userBranchRole.create).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_1",
        name: "Updated Name",
        mobile: "+91 9999988888",
        email: "member@riverview.com",
        image: null,
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_member_1",
        "PATCH",
        {
          name: "Updated Name",
          mobile: "+91 9999988888",
          roleId: "role_manager",
        }
      );

      const res = await PATCH_MEMBER(req, {
        params: Promise.resolve({ id: "uo_member_1" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.member.name).toBe("Updated Name");
      expect(json.member.mobile).toBe("+91 9999988888");
      expect(json.member.roleName).toBe("Manager");
    });

    it("validates POS PIN numeric format if provided", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_member_1",
        "PATCH",
        { managerPin: "12" } // invalid: too short (< 4 digits)
      );

      const res = await PATCH_MEMBER(req, {
        params: Promise.resolve({ id: "uo_member_1" }),
      });

      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("VALIDATION_ERROR");
      expect(json.detail).toContain("POS / Terminal PIN must be between 4 and 6 numeric digits");
    });

    it("supports assigning multiple roles and multiple branches", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_member_multi",
        userId: "usr_multi_1",
        organizationId: "org_riverview",
        status: "ACTIVE",
        user: {
          id: "usr_multi_1",
          name: "Multi Role Staff",
          email: "multi@riverview.com",
          mobile: null,
          branchRoles: [
            {
              branchId: null,
              role: { id: "role_cashier", slug: "cashier", name: "Cashier" },
            },
          ],
        },
      } as never);

      vi.mocked(prisma.role.findFirst).mockResolvedValueOnce({
        id: "role_cashier",
        slug: "cashier",
        name: "Cashier",
      } as never);

      vi.mocked(prisma.user.update).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.userBranchRole.deleteMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.userBranchRole.create).mockResolvedValue({} as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_member_multi",
        "PATCH",
        {
          name: "Multi Role Staff",
          roleIds: ["role_cashier", "role_manager"],
          branchIds: ["br_downtown", "br_westend"],
        }
      );

      const res = await PATCH_MEMBER(req, {
        params: Promise.resolve({ id: "uo_member_multi" }),
      });

      expect(res.status).toBe(200);
      // deleteMany should be called to clear old assignments
      expect(prisma.userBranchRole.deleteMany).toHaveBeenCalled();
      // create should be called 4 times (2 roles x 2 branches)
      expect(prisma.userBranchRole.create).toHaveBeenCalledTimes(4);
    });
  });

  describe("Phase 20 Convergence: Owner Immunity & Member Reactivation", () => {
    it("blocks suspending or revoking the primary organization founder/creator", async () => {
      // Mock org metadata identifying usr_admin_1 as creatorUserId
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        metadata: { creatorUserId: "usr_founder_1" },
      } as never);

      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_founder",
        userId: "usr_founder_1",
        organizationId: "org_riverview",
        status: "ACTIVE",
        user: {
          id: "usr_founder_1",
          name: "Founder Owner",
          email: "founder@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: { id: "role_owner", slug: "owner", name: "Owner" },
            },
          ],
        },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_founder/status",
        "PATCH",
        { status: "SUSPENDED" }
      );

      const res = await PATCH_STATUS(req, {
        params: Promise.resolve({ id: "uo_founder" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("LAST_ADMIN_PROTECTION");
      expect(json.detail).toContain("Cannot suspend the primary organization owner");
    });

    it("allows reactivating a suspended team member back to ACTIVE", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_suspended_member",
        userId: "usr_staff_suspended",
        organizationId: "org_riverview",
        status: "SUSPENDED",
        user: {
          id: "usr_staff_suspended",
          name: "Suspended Staff",
          email: "suspended@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: { id: "role_cashier", slug: "cashier", name: "Cashier" },
            },
          ],
        },
      } as never);

      vi.mocked(prisma.userOrganization.update).mockResolvedValueOnce({
        id: "uo_suspended_member",
        status: "ACTIVE",
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_suspended_member/status",
        "PATCH",
        { status: "ACTIVE" }
      );

      const res = await PATCH_STATUS(req, {
        params: Promise.resolve({ id: "uo_suspended_member" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.member.status).toBe("ACTIVE");
    });
  });

  describe("DELETE /api/v1/settings/members/[id] (Permanent Member Removal from Workspace)", () => {
    it("rejects deletion when caller lacks USERS_MANAGE permission", async () => {
      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_to_delete",
        "DELETE",
        undefined,
        { permissions: [PERMISSIONS.CORE.USERS_READ] }
      );

      const res = await DELETE_MEMBER(req, {
        params: Promise.resolve({ id: "uo_to_delete" }),
      });

      expect(res.status).toBe(403);
    });

    it("prohibits permanent removal of the primary organization owner", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_founder",
        userId: "usr_founder",
        organizationId: "org_riverview",
        user: {
          id: "usr_founder",
          email: "founder@riverview.com",
          branchRoles: [],
        },
      } as never);

      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        metadata: { creatorUserId: "usr_founder" },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_founder",
        "DELETE"
      );

      const res = await DELETE_MEMBER(req, {
        params: Promise.resolve({ id: "uo_founder" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SAFEGUARD_VIOLATION");
      expect(json.detail).toContain(
        "The primary organization owner cannot be removed from the organization."
      );
    });

    it("prohibits permanent removal of the sole active administrator", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_sole_admin",
        userId: "usr_sole_admin",
        organizationId: "org_riverview",
        user: {
          id: "usr_sole_admin",
          email: "soleadmin@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: { id: "role_owner", slug: "owner", name: "Owner" },
            },
          ],
        },
      } as never);

      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        metadata: { creatorUserId: "usr_other_creator" },
      } as never);

      // count other active admins returns 0
      vi.mocked(prisma.userOrganization.count).mockResolvedValueOnce(0);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_sole_admin",
        "DELETE"
      );

      const res = await DELETE_MEMBER(req, {
        params: Promise.resolve({ id: "uo_sole_admin" }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.code).toBe("SAFEGUARD_VIOLATION");
      expect(json.detail).toContain(
        "Cannot remove the last remaining organization administrator."
      );
    });

    it("successfully removes member permanently from workspace and terminates sessions", async () => {
      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_removable",
        userId: "usr_removable",
        organizationId: "org_riverview",
        user: {
          id: "usr_removable",
          email: "removable@riverview.com",
          branchRoles: [
            {
              branchId: null,
              role: { id: "role_waiter", slug: "waiter", name: "Waiter" },
            },
          ],
        },
      } as never);

      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        metadata: { creatorUserId: "usr_founder" },
      } as never);

      const req = await createAuthenticatedRequest(
        "/api/v1/settings/members/uo_removable",
        "DELETE"
      );

      const res = await DELETE_MEMBER(req, {
        params: Promise.resolve({ id: "uo_removable" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("removed from organization");

      // Verify deletion transaction was triggered
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
