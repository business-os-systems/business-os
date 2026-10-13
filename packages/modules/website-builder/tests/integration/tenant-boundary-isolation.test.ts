import { describe, expect, it } from "vitest";
import {
  createAdminPagesRouter,
  PageService,
} from "../../src/index.js";

describe("Multi-Tenant Boundary Isolation Integration Suite (S1-8)", () => {
  it("strictly denies cross-tenant read access between distinct organizations", async () => {
    const service = new PageService();

    // Create page under org_alpha
    await service.createPage({
      id: "page_isolated_alpha",
      organizationId: "org_alpha",
      siteId: "site_alpha_01",
      slug: "/secret-alpha",
      title: "Alpha Secret Strategy",
      isHomePage: false,
      draftAst: { hero: "Alpha only content" },
    });

    // 1. Direct service query by org_alpha succeeds
    const alphaRead = await service.getPage("org_alpha", "page_isolated_alpha");
    expect(alphaRead).not.toBeNull();
    expect(alphaRead?.title).toBe("Alpha Secret Strategy");

    // 2. Direct service query by intruder org_beta returns null (isolated)
    const betaRead = await service.getPage("org_beta", "page_isolated_alpha");
    expect(betaRead).toBeNull();

    // 3. Direct service query by intruder org_gamma returns null (isolated)
    const gammaRead = await service.getPage("org_gamma", "page_isolated_alpha");
    expect(gammaRead).toBeNull();
  });

  it("strictly denies cross-tenant write access (PATCH draft AST)", async () => {
    const service = new PageService();
    const router = createAdminPagesRouter(service);

    // Page belongs to org_alpha
    await service.createPage({
      id: "page_secure_alpha",
      organizationId: "org_alpha",
      siteId: "site_alpha_01",
      slug: "/pricing",
      title: "Pricing Alpha",
      isHomePage: false,
      draftAst: { price: 100 },
    });

    // Foreign tenant org_intruder attempts to mutate org_alpha's page
    const unauthorizedMutationRes = await router.request("/pages/page_secure_alpha/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_intruder", // Cross-tenant intruder
      },
      body: JSON.stringify({
        expectedRevision: 1,
        draftAst: { price: 0 }, // Malicious defacement attempt
      }),
    });

    // Must be rejected with 404 (or 403) to prevent information disclosure
    expect(unauthorizedMutationRes.status).toBe(404);
    const problem = (await unauthorizedMutationRes.json()) as {
      type: string;
      status: number;
      detail: string;
      code?: string;
    };
    expect(problem.type).toBe("about:blank");
    expect(problem.code).toBe("CMS_PAGE_NOT_FOUND");
    expect(problem.status).toBe(404);

    // Verify org_alpha page was NOT modified
    const verifiedPage = await service.getPage("org_alpha", "page_secure_alpha");
    expect(verifiedPage?.draftAst).toEqual({ price: 100 });
    expect(verifiedPage?.revision).toBe(1);
  });

  it("strictly denies cross-tenant publish operations", async () => {
    const service = new PageService();
    const router = createAdminPagesRouter(service);

    await service.createPage({
      id: "page_draft_alpha",
      organizationId: "org_alpha",
      siteId: "site_alpha_01",
      slug: "/unreleased-product",
      title: "Unreleased Product",
      isHomePage: false,
      draftAst: { feature: "Confidential" },
    });

    // Foreign tenant org_beta attempts to publish org_alpha's draft
    const unauthorizedPublishRes = await router.request("/pages/page_draft_alpha/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_beta",
      },
      body: JSON.stringify({
        expectedRevision: 1,
      }),
    });

    // Cross-tenant publish must fail
    expect(unauthorizedPublishRes.status).toBe(409); // service returns failure -> router responds with error

    // Verify page in org_alpha is still in DRAFT status
    const verifiedPage = await service.getPage("org_alpha", "page_draft_alpha");
    expect(verifiedPage?.status).toBe("DRAFT");
    expect(verifiedPage?.publishedAst).toBeNull();
  });

  it("strictly denies cross-tenant deletion operations", async () => {
    const service = new PageService();

    await service.createPage({
      id: "page_vital_alpha",
      organizationId: "org_alpha",
      siteId: "site_alpha_01",
      slug: "/terms",
      title: "Terms and Conditions",
      isHomePage: false,
      draftAst: { text: "Legal terms" },
    });

    // Attacker org_hostile attempts to delete page_vital_alpha
    const deleteAttempt = await service.deletePage("org_hostile", "page_vital_alpha");
    expect(deleteAttempt).toBe(false);

    // Verify original page is intact
    const survivingPage = await service.getPage("org_alpha", "page_vital_alpha");
    expect(survivingPage).not.toBeNull();
    expect(survivingPage?.id).toBe("page_vital_alpha");

    // Legitimate owner deletes
    const legitimateDelete = await service.deletePage("org_alpha", "page_vital_alpha");
    expect(legitimateDelete).toBe(true);

    const postDeleteCheck = await service.getPage("org_alpha", "page_vital_alpha");
    expect(postDeleteCheck).toBeNull();
  });

  it("guarantees listPages isolation across multiple tenants on identical site slugs", async () => {
    const service = new PageService();

    // org_1 creates 2 pages under site "site_shared_name"
    await service.createPage({
      id: "p1_org1",
      organizationId: "org_1",
      siteId: "site_shared_name",
      slug: "/home",
      title: "Org 1 Home",
      isHomePage: true,
      draftAst: {},
    });
    await service.createPage({
      id: "p2_org1",
      organizationId: "org_1",
      siteId: "site_shared_name",
      slug: "/about",
      title: "Org 1 About",
      isHomePage: false,
      draftAst: {},
    });

    // org_2 creates 1 page under site "site_shared_name"
    await service.createPage({
      id: "p1_org2",
      organizationId: "org_2",
      siteId: "site_shared_name",
      slug: "/home",
      title: "Org 2 Home",
      isHomePage: true,
      draftAst: {},
    });

    // Query pages for org_1
    const org1Pages = await service.listPages("org_1", "site_shared_name");
    expect(org1Pages).toHaveLength(2);
    expect(org1Pages.map((p) => p.id)).toEqual(["p1_org1", "p2_org1"]);

    // Query pages for org_2
    const org2Pages = await service.listPages("org_2", "site_shared_name");
    expect(org2Pages).toHaveLength(1);
    expect(org2Pages.map((p) => p.id)).toEqual(["p1_org2"]);

    // Query pages for non-existent org_3
    const org3Pages = await service.listPages("org_3", "site_shared_name");
    expect(org3Pages).toHaveLength(0);
  });
});
