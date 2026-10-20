import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "@suite/db";
import { hashPin, verifyOverrideToken } from "@suite/auth";
import type { ProblemDetails } from "@suite/core";
import { UnauthorizedError, ForbiddenError } from "@suite/core/errors";

describe("Integration: Manager Override PIN & Anti-Theft Mechanics", () => {
  const app = createApp({ enableRateLimiting: false });

  const TEST_ORG_ID = "org_override_test_01";
  const MANAGER_USER_ID = "user_mgr_test_01";
  const MANAGER_RAW_PIN = "849201";
  if (!process.env.BETTER_AUTH_SECRET) {
    process.env.BETTER_AUTH_SECRET = "suite-test-manager-override-secret-key-32ch";
  }
  const SECRET_KEY = process.env.BETTER_AUTH_SECRET;

  beforeEach(async () => {
    // Clean up
    await prisma.user.deleteMany({ where: { id: MANAGER_USER_ID } });
    await prisma.organization.deleteMany({ where: { id: TEST_ORG_ID } });

    // Create organization
    await prisma.organization.create({
      data: {
        id: TEST_ORG_ID,
        name: "Security Test Org",
        slug: "security-test-org",
        currency: "INR",
        country: "IN",
      },
    });

    // Hash manager PIN with Argon2id
    const hashedPin = await hashPin(MANAGER_RAW_PIN);

    // Ensure override capability permission exists and is assigned to manager role
    const overridePerm = await prisma.permission.upsert({
      where: { action: "manager_override:verify" },
      update: {},
      create: {
        appId: "core",
        action: "manager_override:verify",
        description: "Manager Override Verification",
      },
    });

    // Ensure branch-manager role exists with capability permission
    let managerRole = await prisma.role.findFirst({
      where: { slug: "branch-manager" },
      include: { permissions: true },
    });
    if (!managerRole) {
      managerRole = await prisma.role.create({
        data: {
          slug: "branch-manager",
          name: "Branch Manager",
          isSystem: true,
          permissions: {
            create: {
              permissionId: overridePerm.id,
            },
          },
        },
        include: { permissions: true },
      });
    } else if (managerRole.permissions.length === 0) {
      await prisma.rolePermission.create({
        data: {
          roleId: managerRole.id,
          permissionId: overridePerm.id,
        },
      });
    }

    // Create manager user with organization and branchRoles
    await prisma.user.create({
      data: {
        id: MANAGER_USER_ID,
        email: "general.manager@security-test.com",
        name: "Devendra Rawat",
        emailVerified: true,
        managerPinHash: hashedPin,
        organizations: {
          create: {
            organizationId: TEST_ORG_ID,
          },
        },
        branchRoles: {
          create: {
            organizationId: TEST_ORG_ID,
            roleId: managerRole.id,
          },
        },
      },
    });
  });

  describe("API Endpoint POST /api/v1/auth/manager-override/verify", () => {
    it("rejects invalid manager PIN with 401 Unauthorized", async () => {
      const res = await app.request("/api/v1/auth/manager-override/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerPin: "000000", // Wrong PIN
          action: "finance:refund:override",
          targetEntityId: "inv_rec_9999",
          reason: "Customer disputed charge on bill",
          organizationId: TEST_ORG_ID,
        }),
      });

      expect(res.status).toBe(401);
      const problem = (await res.json()) as ProblemDetails;
      expect(problem.status).toBe(401);
      expect(problem.code).toBe("PIN_INVALID");
    });

    it("rejects malformed payload with 422 Unprocessable Entity", async () => {
      const res = await app.request("/api/v1/auth/manager-override/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerPin: "abc-non-digits", // Malformed
          action: "a", // Too short
          targetEntityId: "",
          reason: "no",
          organizationId: TEST_ORG_ID,
        }),
      });

      expect(res.status).toBe(422);
      const problem = (await res.json()) as ProblemDetails;
      expect(problem.code).toBe("VALIDATION_ERROR");
      expect(problem.invalidParams).toBeDefined();
    });

    it("accepts valid manager PIN and returns signed HMAC override token", async () => {
      const res = await app.request("/api/v1/auth/manager-override/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerPin: MANAGER_RAW_PIN,
          action: "finance:refund:override",
          targetEntityId: "inv_rec_9999",
          reason: "Customer disputed charge on bill",
          organizationId: TEST_ORG_ID,
        }),
      });

      expect(res.status).toBe(200);

      interface SuccessResponse {
        success: boolean;
        data: {
          verified: boolean;
          managerUserId: string;
          managerName: string;
          overrideToken: string;
          expiresAt: string;
        };
      }

      const body = (await res.json()) as SuccessResponse;
      expect(body.success).toBe(true);
      expect(body.data.verified).toBe(true);
      expect(body.data.managerUserId).toBe(MANAGER_USER_ID);
      expect(body.data.managerName).toBe("Devendra Rawat");
      expect(typeof body.data.overrideToken).toBe("string");
      expect(body.data.overrideToken).toContain(".");

      // Cryptographic signature verification
      const validatedToken = verifyOverrideToken({
        overrideToken: body.data.overrideToken,
        expectedAction: "finance:refund:override",
        expectedTargetEntityId: "inv_rec_9999",
        secretKey: SECRET_KEY,
      });

      expect(validatedToken.valid).toBe(true);
      expect(validatedToken.claims.managerUserId).toBe(MANAGER_USER_ID);
      expect(validatedToken.claims.organizationId).toBe(TEST_ORG_ID);
      expect(validatedToken.claims.action).toBe("finance:refund:override");
      expect(validatedToken.claims.targetEntityId).toBe("inv_rec_9999");
    });
  });

  describe("Cryptographic Tamper Protection & Anti-Theft Validation", () => {
    it("rejects token when action is tampered with for privilege escalation", async () => {
      const res = await app.request("/api/v1/auth/manager-override/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerPin: MANAGER_RAW_PIN,
          action: "pos:discount:10pct",
          targetEntityId: "folio_123",
          reason: "Loyalty guest requested courtesy discount",
          organizationId: TEST_ORG_ID,
        }),
      });

      interface SuccessResponse {
        data: { overrideToken: string };
      }
      const body = (await res.json()) as SuccessResponse;
      const validToken = body.data.overrideToken;

      // Attempt to use discount token for cash drawer wipe
      expect(() =>
        verifyOverrideToken({
          overrideToken: validToken,
          expectedAction: "pos:cash_drawer:wipe",
          expectedTargetEntityId: "folio_123",
          secretKey: SECRET_KEY,
        })
      ).toThrow(ForbiddenError);
    });

    it("rejects token with corrupted cryptographic signature", async () => {
      const res = await app.request("/api/v1/auth/manager-override/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerPin: MANAGER_RAW_PIN,
          action: "pos:void:order",
          targetEntityId: "order_987",
          reason: "Order canceled by guest before cooking",
          organizationId: TEST_ORG_ID,
        }),
      });

      interface SuccessResponse {
        data: { overrideToken: string };
      }
      const body = (await res.json()) as SuccessResponse;
      const [claims, signature] = body.data.overrideToken.split(".");

      // Tamper with signature
      const tamperedToken = `${claims}.${signature}corrupted_suffix`;

      expect(() =>
        verifyOverrideToken({
          overrideToken: tamperedToken,
          expectedAction: "pos:void:order",
          expectedTargetEntityId: "order_987",
          secretKey: SECRET_KEY,
        })
      ).toThrow(UnauthorizedError);
    });
  });
});
