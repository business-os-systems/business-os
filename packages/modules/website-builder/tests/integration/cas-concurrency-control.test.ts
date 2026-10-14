import { describe, expect, it, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@suite/db";
import {
  createAdminPagesRouter,
  PageService,
} from "../../src/index.js";

describe("Authoring Studio CAS Concurrency Control Integration Suite (S1-8)", () => {
  const pageService = new PageService();

  beforeAll(async () => {
    await prisma.organization.upsert({
      where: { id: "org_cas_concurrency" },
      update: {},
      create: { id: "org_cas_concurrency", name: "CAS Concurrency Org", slug: "cas-concurrency-org" },
    });
    await prisma.cmsSite.upsert({
      where: { id_organizationId: { id: "site_cas_concurrency", organizationId: "org_cas_concurrency" } },
      update: {},
      create: {
        id: "site_cas_concurrency",
        organizationId: "org_cas_concurrency",
        title: "Alpha Site",
        slug: "site-alpha-01",
      },
    });
  });

  beforeEach(async () => {
    await prisma.cmsPageVersion.deleteMany({
      where: { organizationId: "org_cas_concurrency", pageId: "page_cas_concurrency_1" },
    });
    await prisma.cmsPageContent.deleteMany({
      where: { organizationId: "org_cas_concurrency", pageId: "page_cas_concurrency_1" },
    });
    await prisma.cmsPage.deleteMany({
      where: { organizationId: "org_cas_concurrency", id: "page_cas_concurrency_1" },
    });
    await pageService.createPage({
      id: "page_cas_concurrency_1",
      organizationId: "org_cas_concurrency",
      siteId: "site_cas_concurrency",
      slug: "/about-us",
      title: "About Us",
      draftAst: { sections: [{ id: "sec_1", type: "hero" }] },
    });
  });

  afterAll(async () => {
    await prisma.cmsPage.deleteMany({
      where: { organizationId: "org_cas_concurrency", id: "page_cas_concurrency_1" },
    });
  });
  it("orchestrates multi-editor optimistic locking race condition and prevents lost updates", async () => {
    const pageService = new PageService();
    const router = createAdminPagesRouter(pageService);

    // Initial state: page_cas_concurrency_1 has revision: 1
    // Editor Alice reads page at revision 1
    const aliceExpectedRevision = 1;

    // Editor Bob also reads page at revision 1 concurrently
    const bobExpectedRevision = 1;

    // 1. Editor Alice performs autosave draft update first
    const aliceRes = await router.request("/pages/page_cas_concurrency_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_cas_concurrency",
      },
      body: JSON.stringify({
        expectedRevision: aliceExpectedRevision,
        draftAst: {
          sections: [
            { id: "hero-1", type: "hero", props: { headline: "Alice's Headline" } },
          ],
        },
      }),
    });

    expect(aliceRes.status).toBe(200);
    const aliceData = (await aliceRes.json()) as { success: boolean; revision: number };
    expect(aliceData.success).toBe(true);
    expect(aliceData.revision).toBe(2); // Revision bumped to 2

    // 2. Editor Bob attempts to save his changes without having refreshed, expecting revision 1
    const bobConflictRes = await router.request("/pages/page_cas_concurrency_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_cas_concurrency",
      },
      body: JSON.stringify({
        expectedRevision: bobExpectedRevision, // Stale revision 1!
        draftAst: {
          sections: [
            { id: "hero-1", type: "hero", props: { headline: "Bob's Stale Headline" } },
          ],
        },
      }),
    });

    // CAS must reject with 409 Conflict, preventing Alice's edit from being silently overwritten
    expect(bobConflictRes.status).toBe(409);
    const bobConflictData = (await bobConflictRes.json()) as {
      type: string;
      status: number;
      detail: string;
      activeRevision: number;
      code?: string;
    };
    expect(bobConflictData.type).toBe("about:blank");
    expect(bobConflictData.code).toBe("CMS_CONCURRENCY_CONFLICT");
    expect(bobConflictData.status).toBe(409);
    expect(bobConflictData.activeRevision).toBe(2);

    // 3. Bob's client receives 409, merges Alice's changes, updates expectedRevision to 2, and retries
    const bobResolvedRes = await router.request("/pages/page_cas_concurrency_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_cas_concurrency",
      },
      body: JSON.stringify({
        expectedRevision: 2, // Updated to latest revision
        draftAst: {
          sections: [
            { id: "hero-1", type: "hero", props: { headline: "Merged Headline by Bob & Alice" } },
            { id: "features-1", type: "features", props: { count: 3 } },
          ],
        },
      }),
    });

    expect(bobResolvedRes.status).toBe(200);
    const bobResolvedData = (await bobResolvedRes.json()) as { success: boolean; revision: number };
    expect(bobResolvedData.success).toBe(true);
    expect(bobResolvedData.revision).toBe(3); // Bumped to 3
  });

  it("enforces CAS verification on publish and prevents releasing out-of-date drafts", async () => {
    const pageService = new PageService();
    const router = createAdminPagesRouter(pageService);

    // 1. Client tries to publish page expecting revision 99 (mismatched)
    const stalePublishRes = await router.request("/pages/page_cas_concurrency_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_cas_concurrency",
      },
      body: JSON.stringify({
        expectedRevision: 99,
      }),
    });

    expect(stalePublishRes.status).toBe(409);
    const conflictBody = (await stalePublishRes.json()) as { activeRevision: number };
    expect(conflictBody.activeRevision).toBe(1);

    // 2. Client publishes with accurate active revision 1
    const publishRes = await router.request("/pages/page_cas_concurrency_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_cas_concurrency",
      },
      body: JSON.stringify({
        expectedRevision: 1,
      }),
    });

    expect(publishRes.status).toBe(200);
    const publishData = (await publishRes.json()) as {
      success: boolean;
      revision: number;
      versionNumber: number;
    };
    expect(publishData.success).toBe(true);
    expect(publishData.revision).toBe(2);
    expect(publishData.versionNumber).toBe(1);

    // 3. Repeating publish with previous revision 1 fails now that revision is 2
    const secondPublishRes = await router.request("/pages/page_cas_concurrency_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_cas_concurrency",
      },
      body: JSON.stringify({
        expectedRevision: 1,
      }),
    });

    expect(secondPublishRes.status).toBe(409);
  });
});
