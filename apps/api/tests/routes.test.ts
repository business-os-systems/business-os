import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProblemDetails } from "@suite/core";
import type { SsoDiscoveryResult } from "@suite/auth";
import { createApp } from "../src/app.js";
import { prisma } from "@suite/db";

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
    it("GET /api/v1/organizations lists active organizations", async () => {
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

      const res = await app.request("/api/v1/organizations");
      expect(res.status).toBe(200);

      const body = (await res.json()) as OrgListResponse;
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.id).toBe("org_test_1");
      expect(body.requestId).toBeDefined();
    });

    it("POST /api/v1/organizations returns 422 validation error when slug is invalid", async () => {
      const res = await app.request("/api/v1/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      const res = await app.request("/api/v1/organizations/org_nonexistent");
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
  });
});
