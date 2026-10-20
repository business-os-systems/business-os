import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../src/app/api/v1/auth/invitation/accept/route";
import {
  SESSION_COOKIE_NAME,
  encodeSessionPayload,
  signSessionToken,
} from "@suite/auth";
import { prisma } from "@suite/db";

// Mock @suite/db prisma client
vi.mock("@suite/db", () => {
  const mockPrisma = {
    organizationInvitation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    account: {
      upsert: vi.fn(),
    },
    branch: {
      findUnique: vi.fn(),
    },
    userOrganization: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    userBranchRole: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (callback) => callback(mockPrisma)),
  };
  return { prisma: mockPrisma };
});

// Mock @suite/auth hashPassword to avoid running real argon2 in tests
vi.mock("@suite/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@suite/auth")>();
  return {
    ...actual,
    hashPassword: vi.fn().mockResolvedValue("mocked_argon2id_hash"),
  };
});

describe("Invitation Acceptance & Auto-Login API (Issue #156)", () => {
  beforeAll(() => {
    process.env.BETTER_AUTH_SECRET =
      "test-secret-key-that-is-at-least-32-chars-long!";
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/v1/auth/invitation/accept", () => {
    it("returns 400 problem details when token query param is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 problem details when invitation token does not exist", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept?token=non_existent");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.code).toBe("INVITATION_NOT_FOUND");
    });

    it("returns 409 conflict when invitation is no longer PENDING", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_accepted",
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_1", name: "Acme Corp", slug: "acme", logo: null },
        role: { id: "role_1", name: "Manager", slug: "manager" },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept?token=tok_accepted");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe("INVITATION_ACCEPTED");
      expect(data.isAccepted).toBe(true);
    });

    it("returns 410 gone when invitation has expired", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_expired",
        status: "PENDING",
        expiresAt: new Date(Date.now() - 86400000), // yesterday
        organization: { id: "org_1", name: "Acme Corp", slug: "acme", logo: null },
        role: { id: "role_1", name: "Manager", slug: "manager" },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept?token=tok_expired");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(410);
      expect(data.code).toBe("INVITATION_EXPIRED");
    });

    it("returns 200 with invitation metadata when token is valid", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_valid",
        email: "staff@acme.com",
        branchId: "branch_north",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_1", name: "Acme Corp", slug: "acme", logo: null },
        role: { id: "role_1", name: "General Manager", slug: "gm" },
      } as never);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "usr_existing",
        name: "Staff Person",
        accounts: [{ id: "acc_1", providerId: "credential" }],
      } as never);

      vi.mocked(prisma.userBranchRole.findFirst).mockResolvedValueOnce({
        branch: { name: "North Branch" },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept?token=tok_valid");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isValid).toBe(true);
      expect(data.email).toBe("staff@acme.com");
      expect(data.name).toBe("Staff Person");
      expect(data.organizationName).toBe("Acme Corp");
      expect(data.roleName).toBe("General Manager");
      expect(data.branchName).toBe("North Branch");
      expect(data.hasPassword).toBe(true);
    });
  });

  describe("POST /api/v1/auth/invitation/accept", () => {
    it("returns 400 validation error if token is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("VALIDATION_ERROR");
    });

    it("returns 422 password required when unauthenticated user does not provide password", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_123",
        email: "invited@riverview.com",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_1", name: "River View", slug: "rv" },
        role: { id: "role_1", name: "Member", slug: "member", permissions: [] },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok_123" }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(422);
      expect(data.code).toBe("PASSWORD_REQUIRED");
    });

    it("successfully creates credentials, activates membership and returns session cookie", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_valid_enroll",
        email: "alice@riverview.com",
        organizationId: "org_riverview",
        branchId: "branch_main",
        roleId: "role_staff",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_riverview", name: "River View Homestay", slug: "rv" },
        role: {
          id: "role_staff",
          name: "Staff",
          slug: "staff",
          permissions: [{ permission: { action: "core:users:read" } }],
        },
      } as never);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null); // not existing initially
      vi.mocked(prisma.user.create).mockResolvedValueOnce({
        id: "usr_alice",
        email: "alice@riverview.com",
        name: "Alice Smith",
        metadata: {},
      } as never);

      vi.mocked(prisma.account.upsert).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.userOrganization.upsert).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.userBranchRole.deleteMany).mockResolvedValueOnce({ count: 0 });
      vi.mocked(prisma.userBranchRole.create).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.organizationInvitation.update).mockResolvedValueOnce({} as never);
      vi.mocked(prisma.session.create).mockResolvedValueOnce({} as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "tok_valid_enroll",
          name: "Alice Smith",
          password: "SecurePassword123!",
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.redirectUrl).toBe("/dashboard");

      // Verify session cookie was set
      const setCookie = res.headers.get("set-cookie");
      expect(setCookie).toContain(SESSION_COOKIE_NAME);

      // Verify database operations
      expect(prisma.account.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            providerId_accountId: {
              providerId: "credential",
              accountId: "alice@riverview.com",
            },
          },
          create: expect.objectContaining({
            userId: "usr_alice",
            password: "mocked_argon2id_hash",
          }),
        })
      );
    });

    it("rejects token with 409 INVITATION_ACCEPTED when invitation has already been consumed/accepted", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_already_accepted",
        email: "alice@riverview.com",
        organizationId: "org_riverview",
        roleId: "role_staff",
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_riverview", name: "River View Homestay", slug: "rv" },
        role: {
          id: "role_staff",
          name: "Staff",
          slug: "staff",
          permissions: [{ permission: { action: "core:users:read" } }],
        },
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "tok_already_accepted",
          password: "SecurePassword123!",
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.code).toBe("INVITATION_ACCEPTED");
      expect(data.isAccepted).toBe(true);
    });

    it("returns 403 problem details when user account is SUSPENDED or REVOKED", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_suspended",
        token: "tok_suspended_user",
        email: "suspended@riverview.com",
        organizationId: "org_riverview",
        roleId: "role_staff",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_riverview", name: "River View Homestay", slug: "rv" },
        role: {
          id: "role_staff",
          name: "Staff",
          slug: "staff",
        },
      } as never);

      vi.mocked(prisma.userOrganization.findFirst).mockResolvedValueOnce({
        id: "uo_suspended",
        status: "SUSPENDED",
      } as never);

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "tok_suspended_user",
          password: "SecurePassword123!",
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("INVITATION_REVOKED");
    });

    it("returns 403 INVITATION_EMAIL_MISMATCH when authenticated session email differs from invitation email", async () => {
      vi.mocked(prisma.organizationInvitation.findUnique).mockResolvedValueOnce({
        id: "inv_1",
        token: "tok_hijack_attempt",
        email: "victim@riverview.com",
        organizationId: "org_riverview",
        branchId: "branch_main",
        roleId: "role_staff",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000),
        organization: { id: "org_riverview", name: "River View Homestay", slug: "rv" },
        role: {
          id: "role_staff",
          name: "Staff",
          slug: "staff",
          permissions: [],
        },
      } as never);

      const attackerSessionToken = await signSessionToken(
        encodeSessionPayload({
          userId: "usr_attacker",
          email: "attacker@malicious.com",
          userName: "Attacker",
          organizationId: "org_attacker",
          role: "owner",
          permissions: ["*"],
          timestamp: Date.now(),
        })
      );

      const req = new NextRequest("http://localhost:3000/api/v1/auth/invitation/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${SESSION_COOKIE_NAME}=${attackerSessionToken}`,
        },
        body: JSON.stringify({
          token: "tok_hijack_attempt",
        }),
      });

      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.code).toBe("INVITATION_EMAIL_MISMATCH");
    });
  });
});
