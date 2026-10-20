import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@suite/db";
import {
  createStorefrontRouter,
  StorefrontService,
  createWebsiteBuilderRoutes,
  ResolvedDomainSchema,
} from "../../src/index.js";

describe("Storefront Edge Resolution & Data Minimization Integration Suite (S1-8)", () => {
  const service = new StorefrontService();
  const router = createStorefrontRouter(service);
  const rootRouter = createWebsiteBuilderRoutes(undefined, undefined, undefined, service);

  beforeAll(async () => {
    await prisma.organization.upsert({
      where: { id: "org_boutique" },
      update: {},
      create: { id: "org_boutique", name: "Boutique Hotel Org", slug: "boutique-hotel" },
    });
    const site = await prisma.cmsSite.upsert({
      where: { id_organizationId: { id: "site_boutique", organizationId: "org_boutique" } },
      update: { status: "PUBLISHED" },
      create: {
        id: "site_boutique",
        organizationId: "org_boutique",
        title: "Boutique Hotel",
        slug: "boutique-hotel-example-com",
        status: "PUBLISHED",
        primaryLocale: "en",
        timezone: "Asia/Kolkata",
      },
    });
    await prisma.cmsDomain.upsert({
      where: { hostname: "boutique-hotel.example.com" },
      update: { status: "ACTIVE" },
      create: {
        id: "dom_boutique_1",
        organizationId: "org_boutique",
        siteId: site.id,
        hostname: "boutique-hotel.example.com",
        status: "ACTIVE",
        isPrimary: true,
        verificationToken: "token_boutique_1",
      },
    });
    await prisma.cmsDomain.upsert({
      where: { hostname: "storefront.resort.org" },
      update: { status: "ACTIVE" },
      create: {
        id: "dom_boutique_2",
        organizationId: "org_boutique",
        siteId: site.id,
        hostname: "storefront.resort.org",
        status: "ACTIVE",
        isPrimary: false,
        verificationToken: "token_boutique_2",
      },
    });
    await prisma.cmsDomain.upsert({
      where: { hostname: "stay.luxury-retreat.com" },
      update: { status: "ACTIVE" },
      create: {
        id: "dom_boutique_3",
        organizationId: "org_boutique",
        siteId: site.id,
        hostname: "stay.luxury-retreat.com",
        status: "ACTIVE",
        isPrimary: false,
        verificationToken: "token_boutique_3",
      },
    });
    await prisma.cmsSiteSettings.upsert({
      where: { siteId_organizationId: { siteId: site.id, organizationId: "org_boutique" } },
      update: {},
      create: { siteId: site.id, organizationId: "org_boutique", brandName: "Boutique Hotel" },
    });
    const homePage = await prisma.cmsPage.upsert({
      where: { id_organizationId: { id: "page_boutique_home", organizationId: "org_boutique" } },
      update: { status: "PUBLISHED", isHomePage: true },
      create: {
        id: "page_boutique_home",
        organizationId: "org_boutique",
        siteId: site.id,
        title: "Home",
        slug: "/",
        status: "PUBLISHED",
        isHomePage: true,
        revision: 1,
      },
    });
    await prisma.cmsPageContent.upsert({
      where: { pageId_organizationId: { pageId: homePage.id, organizationId: "org_boutique" } },
      update: { publishedAst: { sections: [] } },
      create: {
        pageId: homePage.id,
        organizationId: "org_boutique",
        draftAst: { sections: [] },
        publishedAst: { sections: [] },
      },
    });
  });

  it("resolves published domain and verifies strict zero-leakage data minimization", async () => {
    const res = await router.request("/resolve", {
      headers: {
        host: "boutique-hotel.example.com:443",
      },
    });

    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, unknown>;

    // 1. Contract conformity
    const parseResult = ResolvedDomainSchema.safeParse(json);
    expect(parseResult.success).toBe(true);

    // 2. Strict Data Minimization Verification:
    // Core Organization/Branch identifiers and authoring internals MUST NEVER be exposed to public edge
    expect(json["organizationId"]).toBeUndefined();
    expect(json["branchId"]).toBeUndefined();
    expect(json["createdBy"]).toBeUndefined();
    expect(json["updatedBy"]).toBeUndefined();
    expect(json["internalNotes"]).toBeUndefined();
    expect(json["draftAst"]).toBeUndefined(); // Only publishedAst is delivered

    // 3. Verify public-safe edge payload contents
    if (parseResult.success && parseResult.data.resolved) {
      expect(parseResult.data.siteId).toBeDefined();
      expect(parseResult.data.slug).toBe("boutique-hotel-example-com");
      expect(parseResult.data.primaryLocale).toBe("en");
      expect(parseResult.data.timezone).toBe("Asia/Kolkata");
      expect(parseResult.data.brand).toBeDefined();
      expect(parseResult.data.homePage).toBeDefined();
      if (parseResult.data.homePage) {
        expect(parseResult.data.homePage.publishedAst).toBeDefined();
        // Ensure homePage draftAst is not present
        const homePageRecord = parseResult.data.homePage as Record<string, unknown>;
        expect(homePageRecord["draftAst"]).toBeUndefined();
      }
    }
  });

  it("enforces edge CDN caching headers and surrogate cache tagging for edge invalidation", async () => {
    const res = await router.request("/resolve", {
      headers: {
        host: "storefront.resort.org",
      },
    });

    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control");
    const surrogateKey = res.headers.get("Surrogate-Key");

    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=3600");
    expect(cacheControl).toContain("stale-while-revalidate=86400");
    expect(surrogateKey).toContain("site:");
  });

  it("bypasses public caching completely when authorized preview token is present", async () => {
    const res = await router.request("/resolve", {
      headers: {
        host: "storefront.resort.org",
        "x-preview-token": "1735689600.abcdef1234567890",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate, private");
    expect(res.headers.get("Vary")).toBe("x-preview-token");
  });

  it("returns RFC 7807 problem details when Host header is missing or malformed", async () => {
    const res = await router.request("/resolve");

    expect(res.status).toBe(400);
    const problem = (await res.json()) as {
      type: string;
      title: string;
      status: number;
      detail: string;
    };

    expect(problem.type).toBe("/errors/cms-missing-host");
    expect(problem.status).toBe(400);
    expect(problem.title).toBe("Bad Request");
    expect(problem.detail).toContain("Host request header is required");
  });

  it("handles unresolvable domains gracefully with RFC 7807 404 Problem Details", async () => {
    const res = await router.request("/resolve", {
      headers: {
        host: "unknown",
      },
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as {
      type: string;
      title: string;
      status: number;
      detail: string;
    };
    expect(body.type).toBe("/errors/cms-domain-not-found");
    expect(body.title).toBe("Domain Not Found");
    expect(body.status).toBe(404);

    // Also verify direct service contract returns resolved: false
    const directResult = await service.resolveHostname("unknown");
    expect(directResult.resolved).toBe(false);
    if (!directResult.resolved) {
      expect(directResult.reason).toBe("INVALID_HOSTNAME");
    }
  });

  it("resolves through root composite module router seamlessly", async () => {
    const res = await rootRouter.request("/storefront/resolve", {
      headers: {
        host: "stay.luxury-retreat.com",
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { resolved: boolean };
    expect(data.resolved).toBe(true);
  });
});
