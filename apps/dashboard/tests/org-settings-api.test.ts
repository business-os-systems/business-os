import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "../src/app/api/v1/settings/organization/route";
import {
  createGeneralSettingsFormConfig,
  generalSettingsValidationSchema,
} from "../src/app/(dashboard)/settings/general/general.config";
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
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

describe("Organization Settings API & Config Engine (Issue #154)", () => {
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
      PERMISSIONS.CORE.ORGANIZATION_READ,
      PERMISSIONS.CORE.ORGANIZATION_UPDATE,
    ],
  };

  const mockOrgData = {
    id: "org_riverview",
    name: "River View Hospitality",
    slug: "river-view-hospitality",
    customDomain: "stay.riverview.com",
    currency: "INR",
    country: "IN",
    defaultLocale: "en",
    jurisdiction: "IN_DEFAULT",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    registeredAddress: null,
    taxProfile: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.organization.findUnique).mockResolvedValue(mockOrgData as never);
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

  describe("GET /api/v1/settings/organization", () => {
    it("returns 401 UNAUTHORIZED when session cookie is missing", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { session: null }
      );
      const res = await GET(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
      expect(res.headers.get("Content-Type")).toContain("application/problem+json");
    });

    it("returns 400 ORGANIZATION_REQUIRED when session lacks organizationId", async () => {
      const noOrgSession: SessionPayload = {
        userId: "usr_no_org",
        email: "user@test.com",
        userName: "No Org User",
        timestamp: Date.now(),
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { session: noOrgSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("ORGANIZATION_REQUIRED");
    });

    it("returns 403 FORBIDDEN when user lacks core:organization:read permission", async () => {
      const unprivilegedSession: SessionPayload = {
        ...baseSession,
        permissions: ["some:other:permission"],
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { session: unprivilegedSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
      expect(data.title).toBe("Access Denied");
    });

    it("returns 404 ORGANIZATION_NOT_FOUND when organization record does not exist", async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(null);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { session: baseSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.code).toBe("ORGANIZATION_NOT_FOUND");
    });

    it("returns 403 ORGANIZATION_ARCHIVED when organization is archived", async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        ...mockOrgData,
        status: "ARCHIVED",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { session: baseSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("ORGANIZATION_ARCHIVED");
    });

    it("returns 200 with model-complete organization profile when authorized", async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce(mockOrgData as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { session: baseSession }
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe("org_riverview");
      expect(data.name).toBe("River View Hospitality");
      expect(data.slug).toBe("river-view-hospitality");
      expect(data.currency).toBe("INR");
      expect(data.country).toBe("IN");
    });
  });

  describe("PATCH /api/v1/settings/organization", () => {
    it("returns 401 UNAUTHORIZED when session is missing", async () => {
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { method: "PATCH", body: { name: "New Name" }, session: null }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe("UNAUTHORIZED");
    });

    it("returns 403 FORBIDDEN when user lacks core:organization:update permission", async () => {
      const readOnlySession: SessionPayload = {
        ...baseSession,
        permissions: [PERMISSIONS.CORE.ORGANIZATION_READ],
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { method: "PATCH", body: { name: "New Name" }, session: readOnlySession }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FORBIDDEN");
    });

    it("returns 400 VALIDATION_ERROR when payload fails validation rules", async () => {
      const invalidPayload = {
        name: "A", // too short (min 2)
        currency: "INDIAN_RUPEES", // too long (length 3 required)
      };
      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        { method: "PATCH", body: invalidPayload, session: baseSession }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe("VALIDATION_ERROR");
      expect(data.invalidParams).toBeDefined();
      expect(data.invalidParams.length).toBeGreaterThanOrEqual(2);
    });

    it("returns 409 DOMAIN_ALREADY_EXISTS when custom domain is claimed by another org", async () => {
      vi.mocked(prisma.organization.findFirst).mockResolvedValueOnce({
        id: "org_other_tenant",
        name: "Other Tenant",
        customDomain: "stay.riverview.com",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        {
          method: "PATCH",
          body: { customDomain: "stay.riverview.com" },
          session: baseSession,
        }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.code).toBe("DOMAIN_ALREADY_EXISTS");
      expect(data.title).toBe("Domain Conflict");
    });

    it("returns 200 and updates organization attributes successfully", async () => {
      vi.mocked(prisma.organization.findFirst).mockResolvedValueOnce(null);
      vi.mocked(prisma.organization.update).mockResolvedValueOnce({
        ...mockOrgData,
        name: "River View Resort & Spa",
        currency: "USD",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        {
          method: "PATCH",
          body: {
            name: "River View Resort & Spa",
            currency: "USD",
          },
          session: baseSession,
        }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("River View Resort & Spa");
      expect(data.currency).toBe("USD");
      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "org_riverview" },
          data: expect.objectContaining({
            name: "River View Resort & Spa",
            currency: "USD",
          }),
        })
      );
      const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
    });

    it("returns 403 ORGANIZATION_ARCHIVED when organization is already archived", async () => {
      vi.mocked(prisma.organization.findUnique).mockResolvedValueOnce({
        ...mockOrgData,
        status: "ARCHIVED",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        {
          method: "PATCH",
          body: { name: "Updated Resort" },
          session: baseSession,
        }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("ORGANIZATION_ARCHIVED");
    });

    it("returns 200 when executing Danger Zone archive action and clears session cookie", async () => {
      vi.mocked(prisma.organization.update).mockResolvedValueOnce({
        ...mockOrgData,
        status: "ARCHIVED",
      } as never);

      const req = await createSignedRequest(
        "http://localhost:3001/api/v1/settings/organization",
        {
          method: "PATCH",
          body: { status: "ARCHIVED" },
          session: baseSession,
        }
      );
      const res = await PATCH(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ARCHIVED");
      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "org_riverview" },
          data: expect.objectContaining({
            status: "ARCHIVED",
          }),
        })
      );
      const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
      expect(sessionCookie?.value === "" || sessionCookie?.maxAge === 0).toBe(true);
    });
  });

  describe("Declarative Config & Validation Schema (general.config.ts)", () => {
    it("creates strongly-typed FormConfig with bound dangerConfirmationSlug", () => {
      const config = createGeneralSettingsFormConfig("my-org-slug");

      expect(config.id).toBe("general-settings-form");
      expect(config.sections.length).toBe(3);

      const dangerSection = config.sections.find((s) => s.isDangerZone);
      expect(dangerSection).toBeDefined();
      expect(dangerSection?.isDangerZone).toBe(true);
      expect(dangerSection?.dangerConfirmationSlug).toBe("my-org-slug");

      const identitySection = config.sections.find((s) => s.id === "organization-identity");
      expect(identitySection).toBeDefined();
      if (identitySection && !identitySection.isDangerZone) {
        expect(identitySection.fields.some((f) => (f.name as string) === "slug")).toBe(false);
      }
    });

    it("validates form values against generalSettingsValidationSchema", () => {
      const validValues = {
        name: "Acme Corp",
        customDomain: "app.acmecorp.com",
        currency: "USD",
        country: "US",
        defaultLocale: "en",
        jurisdiction: "US_DEFAULT",
      };

      const result = generalSettingsValidationSchema.safeParse(validValues);
      expect(result.success).toBe(true);
    });

    it("rejects invalid values against generalSettingsValidationSchema", () => {
      const invalidValues = {
        name: "X", // too short
        slug: "",
        currency: "1234", // too long
        country: "USA", // too long
        defaultLocale: "e", // too short
        jurisdiction: "J", // too short
      };

      const result = generalSettingsValidationSchema.safeParse(invalidValues);
      expect(result.success).toBe(false);
    });
  });
});
