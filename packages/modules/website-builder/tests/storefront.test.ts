import { createHmac } from "node:crypto";
import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@suite/db";
import {
  createStorefrontRouter,
  StorefrontService,
  createWebsiteBuilderRoutes,
  ResolvedDomainSchema,
} from "../src/index.js";

describe("Public Storefront Edge Delivery API (S1-4)", () => {
  const service = new StorefrontService();
  const router = createStorefrontRouter(service);
  const rootRouter = createWebsiteBuilderRoutes(undefined, undefined, service);

  beforeAll(async () => {
    await prisma.organization.upsert({
      where: { id: "org_riverview" },
      update: {},
      create: { id: "org_riverview", name: "Riverview", slug: "riverview" },
    });
    const site = await prisma.cmsSite.upsert({
      where: { id_organizationId: { id: "site_riverview", organizationId: "org_riverview" } },
      update: { status: "PUBLISHED" },
      create: {
        id: "site_riverview",
        organizationId: "org_riverview",
        title: "Riverview Storefront",
        slug: "stay-riverview",
        status: "PUBLISHED",
      },
    });
    await prisma.cmsDomain.upsert({
      where: { hostname: "stay.riverview.com" },
      update: { status: "ACTIVE" },
      create: {
        id: "dom_riverview",
        organizationId: "org_riverview",
        siteId: site.id,
        hostname: "stay.riverview.com",
        status: "ACTIVE",
        isPrimary: true,
        verificationToken: "token_abc123",
      },
    });
    await prisma.cmsSiteSettings.upsert({
      where: { siteId_organizationId: { siteId: site.id, organizationId: "org_riverview" } },
      update: {},
      create: { siteId: site.id, organizationId: "org_riverview", brandName: "Riverview Stay" },
    });
    const homePage = await prisma.cmsPage.upsert({
      where: { id_organizationId: { id: "page_riverview_home", organizationId: "org_riverview" } },
      update: { status: "PUBLISHED", isHomePage: true },
      create: {
        id: "page_riverview_home",
        organizationId: "org_riverview",
        siteId: site.id,
        title: "Home",
        slug: "/",
        status: "PUBLISHED",
        isHomePage: true,
        revision: 1,
      },
    });
    await prisma.cmsPageContent.upsert({
      where: { pageId_organizationId: { pageId: homePage.id, organizationId: "org_riverview" } },
      update: { publishedAst: { sections: [] } },
      create: {
        pageId: homePage.id,
        organizationId: "org_riverview",
        draftAst: { sections: [] },
        publishedAst: { sections: [] },
      },
    });
  });

  it("should normalize hostnames correctly (lowercase, strip ports)", () => {
    expect(service.normalizeHostname("Stay.RiverView.COM:8080")).toBe(
      "stay.riverview.com"
    );
    expect(service.normalizeHostname("  test.local  ")).toBe("test.local");
  });

  it("should return 400 when Host header is missing", async () => {
    const res = await router.request("/resolve");
    expect(res.status).toBe(400);

    const data = (await res.json()) as { type: string; status: number };
    expect(data.type).toBe("/errors/cms-missing-host");
    expect(data.status).toBe(400);
  });

  it("should return 200 with cache headers and minimized payload for valid domain", async () => {
    const res = await router.request("/resolve", {
      headers: {
        host: "stay.riverview.com",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(res.headers.get("Surrogate-Key")).toContain("site:");

    const rawData = await res.json();
    const parseResult = ResolvedDomainSchema.safeParse(rawData);
    expect(parseResult.success).toBe(true);

    if (parseResult.success && parseResult.data.resolved) {
      expect(parseResult.data.siteId).toBeDefined();
      expect(parseResult.data.homePage).toBeDefined();
      const rawRecord = rawData as Record<string, unknown>;
      // Verify strict data minimization: zero organizationId or internal credentials emitted
      expect(rawRecord.organizationId).toBeUndefined();
      expect(rawRecord.branchId).toBeUndefined();
    }
  });

  it("should bypass public CDN caching when x-preview-token is supplied", async () => {
    const res = await router.request("/resolve", {
      headers: {
        host: "stay.riverview.com",
        "x-preview-token": "12345.abcde",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate, private"
    );
    expect(res.headers.get("Vary")).toBe("x-preview-token");
  });

  it("should verify signed HMAC preview tokens properly", () => {
    const secret = "test-secret-key-123";
    const pageId = "page-uuid-xyz";
    const now = Math.floor(Date.now() / 1000);

    // Generate valid token via native ESM import
    const sig = createHmac("sha256", secret)
      .update(`${pageId}:${now}`)
      .digest("hex");
    const validToken = `${now}.${sig}`;

    expect(service.verifyPreviewToken(validToken, pageId, secret)).toBe(true);
    expect(service.verifyPreviewToken("invalid.token", pageId, secret)).toBe(
      false
    );
    expect(service.verifyPreviewToken(validToken, "other-page", secret)).toBe(
      false
    );
  });

  it("should resolve route properly when mounted through module root router", async () => {
    const res = await rootRouter.request("/storefront/resolve", {
      headers: {
        host: "stay.riverview.com",
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { resolved: boolean };
    expect(data.resolved).toBe(true);
  });
});
