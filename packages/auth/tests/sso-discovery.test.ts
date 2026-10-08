import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@suite/db";
import {
  extractDomainFromEmail,
  isPublicEmailDomain,
  resolveSsoProviderByEmail,
  provisionJitSsoUser,
} from "../src/sso/index.js";
import { ValidationError, NotFoundError } from "../src/errors.js";

describe("Enterprise SSO Domain Discovery & JIT Provisioning Engine", () => {
  describe("Domain Extraction & Filtering", () => {
    it("extracts and normalizes domain from corporate email", () => {
      expect(extractDomainFromEmail("rohit@himalayanstay.com")).toBe("himalayanstay.com");
      expect(extractDomainFromEmail("  JOHN.DOE@CORP.ACME.COM  ")).toBe("corp.acme.com");
    });

    it("rejects invalid email formats", () => {
      expect(() => extractDomainFromEmail("not-an-email")).toThrow(ValidationError);
      expect(() => extractDomainFromEmail("@nodomain")).toThrow(ValidationError);
      expect(() => extractDomainFromEmail("user@nodot")).toThrow(ValidationError);
    });

    it("identifies consumer public email domains correctly", () => {
      expect(isPublicEmailDomain("gmail.com")).toBe(true);
      expect(isPublicEmailDomain("yahoo.com")).toBe(true);
      expect(isPublicEmailDomain("outlook.com")).toBe(true);
      expect(isPublicEmailDomain("himalayanstay.com")).toBe(false);
    });
  });

  describe("SSO Provider Resolution", () => {
    it("returns internal_suite provider for public consumer email addresses", async () => {
      const mockPrisma = {} as unknown as PrismaClient;
      const result = await resolveSsoProviderByEmail("guest@gmail.com", mockPrisma);

      expect(result).toBeDefined();
      expect(result?.domain).toBe("gmail.com");
      expect(result?.providerType).toBe("internal_suite");
      expect(result?.enforceSso).toBe(false);
      expect(result?.organizationId).toBeNull();
      expect(result?.authUrl).toBeNull();
    });

    it("resolves corporate SSO connection and constructs login URL", async () => {
      const mockPrisma = {
        ssoConnection: {
          findUnique: async ({ where }: { where: { domain: string } }) => {
            if (where.domain === "enterprise-group.com") {
              return {
                id: "sso_conn_01",
                domain: "enterprise-group.com",
                providerType: "google_workspace",
                enforceSso: true,
                organizationId: "org_enterprise_01",
                defaultRoleId: "role_staff",
                organization: {
                  name: "Enterprise Hospitality Group",
                  slug: "enterprise-hospitality",
                },
              };
            }
            return null;
          },
        },
      } as unknown as PrismaClient;

      const result = await resolveSsoProviderByEmail(
        "director@enterprise-group.com",
        mockPrisma,
        "https://api.business-os.com"
      );

      expect(result).toBeDefined();
      expect(result?.domain).toBe("enterprise-group.com");
      expect(result?.providerType).toBe("google_workspace");
      expect(result?.enforceSso).toBe(true);
      expect(result?.organizationName).toBe("Enterprise Hospitality Group");
      expect(result?.organizationSlug).toBe("enterprise-hospitality");
      expect(result?.authUrl).toBe("https://api.business-os.com/api/v1/auth/sso/sso_conn_01/login");
    });

    it("returns null if corporate domain is not enrolled in SSO", async () => {
      const mockPrisma = {
        ssoConnection: {
          findUnique: async () => null,
        },
      } as unknown as PrismaClient;

      const result = await resolveSsoProviderByEmail("employee@unknowncorp.com", mockPrisma);
      expect(result).toBeNull();
    });
  });

  describe("Just-In-Time (JIT) Provisioning", () => {
    it("provisions a brand new corporate user, tenant membership, and default role", async () => {
      const captured: {
        createdUser?: { id: string; email: string; name: string; emailVerified: boolean };
        createdUserOrg?: { userId: string; organizationId: string; status: string };
        createdRoleAssignment?: { userId: string; organizationId: string; roleId: string; branchId: null };
      } = {};

      const mockPrisma = {
        ssoConnection: {
          findUnique: async () => ({
            id: "sso_conn_01",
            organizationId: "org_01",
            defaultRoleId: "role_staff_01",
          }),
        },
        user: {
          findUnique: async () => null, // User does not exist yet
          create: async (args: { data: { email: string; name: string; emailVerified: boolean; mobile: string | null; image: string | null } }) => {
            captured.createdUser = { id: "user_jit_new", ...args.data };
            return captured.createdUser;
          },
        },
        userOrganization: {
          findUnique: async () => null,
          create: async (args: { data: { userId: string; organizationId: string; status: string } }) => {
            captured.createdUserOrg = args.data;
            return captured.createdUserOrg;
          },
        },
        role: {
          findUnique: async () => ({ id: "role_staff_01", slug: "staff" }),
        },
        userBranchRole: {
          findFirst: async () => null,
          create: async (args: { data: { userId: string; organizationId: string; roleId: string; branchId: null } }) => {
            captured.createdRoleAssignment = args.data;
            return captured.createdRoleAssignment;
          },
        },
      } as unknown as PrismaClient;

      const result = await provisionJitSsoUser({
        email: "newemployee@corporate.com",
        name: "New Corporate Employee",
        ssoConnectionId: "sso_conn_01",
        prisma: mockPrisma,
      });

      expect(result.isNewUser).toBe(true);
      expect(result.user.id).toBe("user_jit_new");
      expect(result.user.email).toBe("newemployee@corporate.com");
      expect(result.organizationId).toBe("org_01");
      expect(result.assignedRoleId).toBe("role_staff_01");

      expect(captured.createdUser).toBeDefined();
      expect(captured.createdUser?.emailVerified).toBe(true);
      expect(captured.createdUserOrg?.status).toBe("ACTIVE");
      expect(captured.createdRoleAssignment?.roleId).toBe("role_staff_01");
    });

    it("links existing user to new organization during SSO authentication", async () => {
      const captured: {
        createdUserOrg?: { userId: string; organizationId: string; status: string };
      } = {};

      const mockPrisma = {
        ssoConnection: {
          findUnique: async () => ({
            id: "sso_conn_02",
            organizationId: "org_secondary",
            defaultRoleId: null,
          }),
        },
        user: {
          findUnique: async () => ({
            id: "user_existing_01",
            email: "existing@corporate.com",
            name: "Existing Person",
            emailVerified: true,
          }),
        },
        userOrganization: {
          findUnique: async () => null, // Not yet in secondary org
          create: async (args: { data: { userId: string; organizationId: string; status: string } }) => {
            captured.createdUserOrg = args.data;
            return captured.createdUserOrg;
          },
        },
      } as unknown as PrismaClient;

      const result = await provisionJitSsoUser({
        email: "existing@corporate.com",
        name: "Existing Person",
        ssoConnectionId: "sso_conn_02",
        prisma: mockPrisma,
      });

      expect(result.isNewUser).toBe(false);
      expect(result.user.id).toBe("user_existing_01");
      expect(captured.createdUserOrg).toBeDefined();
      expect(captured.createdUserOrg?.organizationId).toBe("org_secondary");
      expect(captured.createdUserOrg?.status).toBe("ACTIVE");
    });

    it("throws NotFoundError if SSO connection does not exist", async () => {
      const mockPrisma = {
        ssoConnection: {
          findUnique: async () => null,
        },
      } as unknown as PrismaClient;

      await expect(
        provisionJitSsoUser({
          email: "user@corp.com",
          name: "User",
          ssoConnectionId: "invalid_id",
          prisma: mockPrisma,
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
