import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProblemDetails } from "@suite/core";
import type { SsoDiscoveryResult } from "@suite/auth";
import { createApp } from "../src/app.js";
import { prisma } from "@suite/db";
import { redis } from "@suite/redis";
import { createAuthHeaders } from "./helpers/auth.js";

/**
 * This suite proves routing, not suspension. The tenant access guard owns its
 * own suite (tests/platform-tenant-access.test.ts), so it is stubbed here to
 * keep every fixture's organisation state out of the assertions.
 */
vi.mock("../src/services/admin/tenant-access.service.js", () => ({
  readTenantAccessStatus: vi.fn(async () => "ACTIVE"),
  invalidateTenantAccessStatus: vi.fn(async () => undefined),
  TENANT_ACCESS_CACHE_PREFIX: "platform:tenant:access",
  TENANT_ACCESS_CACHE_TTL_SECONDS: 60,
}));

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
}

interface OrgItem {
  id: string;
  name: string;
  slug: string;
  currency: string;
  country: string;
  createdAt: Date;
  branches: unknown[];
}

interface OrgListResponse {
  success: boolean;
  data: OrgItem[];
  requestId: string;
}

interface SsoApiResponse {
  success: boolean;
  data: SsoDiscoveryResult | null;
  requestId: string;
}

describe("Route Integration Suite", () => {
  const app = createApp({ enableRateLimiting: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("OpenAPI Documentation Spec", () => {
    it("GET /openapi.json returns OpenAPI 3.1.0 spec JSON", async () => {
      const res = await app.request("/openapi.json");
      expect(res.status).toBe(200);

      const spec = (await res.json()) as OpenApiSpec;
      expect(spec.openapi).toBe("3.1.0");
      expect(spec.info.title).toContain("Universal Business OS Platform API");
    });

    it("GET /doc returns Scalar API reference documentation HTML", async () => {
      const res = await app.request("/doc");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("<title>Scalar API Reference</title>");
    });
  });

  describe("Organizations Router (/api/v1/organizations)", () => {
    it("GET /api/v1/organizations rejects unauthenticated request with 401", async () => {
      const res = await app.request("/api/v1/organizations");
      expect(res.status).toBe(401);

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("AUTH_UNAUTHORIZED");
    });

    it("GET /api/v1/organizations lists active organizations when authenticated", async () => {
      const mockOrgs: OrgItem[] = [
        {
          id: "org_test_1",
          name: "River View Resorts Ltd",
          slug: "river-view-resorts",
          currency: "INR",
          country: "IN",
          createdAt: new Date(),
          branches: [],
        },
      ];
      vi.spyOn(prisma.organization, "findMany").mockResolvedValueOnce(mockOrgs as never);

      const authHeaders = await createAuthHeaders();
      const res = await app.request("/api/v1/organizations", {
        headers: authHeaders,
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as OrgListResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.id).toBe("org_test_1");
      expect(body.requestId).toBeDefined();
    });

    it("POST /api/v1/organizations returns 422 validation error when slug is invalid", async () => {
      const authHeaders = await createAuthHeaders();
      const res = await app.request("/api/v1/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          name: "Test Org",
          slug: "INVALID SLUG WITH SPACES!",
        }),
      });

      expect(res.status).toBe(422);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("VALIDATION_ERROR");
      expect(body.invalidParams).toBeDefined();
      expect(body.invalidParams?.some((p) => p.name === "slug")).toBe(true);
    });

    it("GET /api/v1/organizations/:id returns 404 when organization not found", async () => {
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce(null);

      const authHeaders = await createAuthHeaders();
      const res = await app.request("/api/v1/organizations/org_nonexistent", {
        headers: authHeaders,
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("ORGANIZATION_NOT_FOUND");
    });
  });

  describe("Auth Router (/api/v1/auth)", () => {
    it("POST /api/v1/auth/switch-branch returns 401 when no session token provided", async () => {
      const res = await app.request("/api/v1/auth/switch-branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId: "branch_delhi_1" }),
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("AUTH_UNAUTHORIZED");
    });

    it("POST /api/v1/auth/sso/discover returns provider or standard login message", async () => {
      vi.spyOn(prisma.ssoConnection, "findUnique").mockResolvedValueOnce(null);

      const res = await app.request("/api/v1/auth/sso/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "staff@example.com" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SsoApiResponse;
      expect(body.success).toBe(true);
      expect(body.data).toBeNull();
    });

    it("POST /api/v1/auth/sso/discover detects public consumer domain", async () => {
      const res = await app.request("/api/v1/auth/sso/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "owner@gmail.com" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as SsoApiResponse;
      expect(body.success).toBe(true);
      expect(body.data?.enforceSso).toBe(false);
      expect(body.data?.providerType).toBe("internal_suite");
    });

    it("GET /api/v1/auth/sso/:id/login redirects browser to /login with error query if IdP unconfigured", async () => {
      vi.spyOn(prisma.ssoConnection, "findUnique").mockResolvedValueOnce({
        id: "sso_conn_99",
        domain: "corp.com",
        config: {},
        organization: { name: "Corporate Group" },
      } as unknown as Awaited<ReturnType<typeof prisma.ssoConnection.findUnique>>);

      const res = await app.request("/api/v1/auth/sso/sso_conn_99/login?email=ceo%40corp.com", {
        method: "GET",
        headers: { Accept: "text/html" },
      });

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login?error=sso_unconfigured");
      expect(location).toContain("domain=corp.com");
      expect(location).toContain("email=ceo%40corp.com");
    });

    it("GET /api/v1/auth/sso/:id/login returns 501 problem details to API clients if IdP unconfigured", async () => {
      vi.spyOn(prisma.ssoConnection, "findUnique").mockResolvedValueOnce({
        id: "sso_conn_99",
        domain: "corp.com",
        config: {},
        organization: { name: "Corporate Group" },
      } as unknown as Awaited<ReturnType<typeof prisma.ssoConnection.findUnique>>);

      const res = await app.request("/api/v1/auth/sso/sso_conn_99/login", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      expect(res.status).toBe(501);
      const body = (await res.json()) as { code: string; title: string };
      expect(body.code).toBe("SSO_IDP_NOT_CONFIGURED");
      expect(body.title).toBe("SSO Configuration Pending");
    });

    it("POST /api/v1/auth/verify-email/request returns 400 when no email or session is provided", async () => {
      const res = await app.request("/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("POST /api/v1/auth/verify-email/request returns 200 when account exists", async () => {
      vi.spyOn(redis, "incr").mockResolvedValue(1);
      vi.spyOn(redis, "expire").mockResolvedValue(1);

      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_test_1",
        email: "unverified@example.com",
        emailVerified: false,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      vi.spyOn(prisma.verification, "deleteMany").mockResolvedValueOnce({ count: 0 });
      vi.spyOn(prisma.verification, "create").mockResolvedValueOnce({
        id: "ver_1",
        identifier: "unverified@example.com",
        value: "hashed_token",
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await app.request("/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "unverified@example.com" }),
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; message: string };
      expect(body.success).toBe(true);
      expect(body.message).toContain("dispatched");
    });

    it("POST /api/v1/auth/verify-email/confirm returns 400 when token is invalid", async () => {
      vi.spyOn(prisma.verification, "findFirst").mockResolvedValueOnce(null);

      const res = await app.request("/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "invalid_raw_token" }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as ProblemDetails;
      expect(body.code).toBe("INVALID_TOKEN");
    });
  });
});

