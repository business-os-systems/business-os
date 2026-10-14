import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "@suite/db";
import {
  createAdminPagesRouter,
  PageService,
  createWebsiteBuilderRoutes,
} from "../src/index.js";

describe("Authoring Studio Management APIs & CAS Concurrency (S1-7)", () => {
  const service = new PageService();
  const router = createAdminPagesRouter(service);
  const rootRouter = createWebsiteBuilderRoutes(service);

  beforeAll(async () => {
    await prisma.organization.upsert({
      where: { id: "org_admin_pages" },
      update: {},
      create: { id: "org_admin_pages", name: "Admin Pages Org", slug: "admin-pages-org" },
    });
    await prisma.cmsSite.upsert({
      where: { id_organizationId: { id: "site_admin_pages", organizationId: "org_admin_pages" } },
      update: {},
      create: {
        id: "site_admin_pages",
        organizationId: "org_admin_pages",
        title: "Alpha Site",
        slug: "alpha-site",
      },
    });
    await prisma.cmsPageVersion.deleteMany({
      where: { organizationId: "org_admin_pages", pageId: "page_admin_test_1" },
    });
    await prisma.cmsPageContent.deleteMany({
      where: { organizationId: "org_admin_pages", pageId: "page_admin_test_1" },
    });
    await prisma.cmsPage.deleteMany({
      where: { organizationId: "org_admin_pages", id: "page_admin_test_1" },
    });
    await service.createPage({
      id: "page_admin_test_1",
      organizationId: "org_admin_pages",
      siteId: "site_admin_pages",
      slug: "/about-us",
      title: "About Us",
      draftAst: { sections: [{ id: "sec_1", type: "hero" }] },
    });
  });

  afterAll(async () => {
    await prisma.cmsPage.deleteMany({
      where: { organizationId: "org_admin_pages", id: "page_admin_test_1" },
    });
  });

  it("should update draft content when expectedRevision matches active revision", async () => {
    const res = await router.request("/pages/page_admin_test_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 1, // matches seed revision
        draftAst: {
          sections: [
            { id: "sec_1", type: "hero", props: { title: "Updated Title" } },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { success: boolean; revision: number };
    expect(data.success).toBe(true);
    expect(data.revision).toBe(2); // Revision advanced atomically
  });

  it("should reject update with 409 Conflict when expectedRevision does not match", async () => {
    // Current revision is now 2; client attempts update expecting revision 1
    const res = await router.request("/pages/page_admin_test_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 1, // Outdated revision
        draftAst: {
          sections: [],
        },
      }),
    });

    expect(res.status).toBe(409);
    const data = (await res.json()) as {
      type: string;
      status: number;
      activeRevision: number;
      code?: string;
    };
    expect(data.type).toBe("about:blank");
    expect(data.code).toBe("CMS_CONCURRENCY_CONFLICT");
    expect(data.status).toBe(409);
    expect(data.activeRevision).toBe(2);
  });

  it("should return 404 when attempting to mutate page of a different tenant", async () => {
    const res = await router.request("/pages/page_admin_test_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_intruder", // Foreign tenant
      },
      body: JSON.stringify({
        expectedRevision: 2,
        draftAst: {},
      }),
    });

    expect(res.status).toBe(404);
  });

  it("should publish page cleanly and promote draftAst to publishedAst", async () => {
    // Active revision is 2
    const res = await router.request("/pages/page_admin_test_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 2,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      revision: number;
      versionNumber: number;
    };
    expect(data.success).toBe(true);
    expect(data.revision).toBe(3);
    expect(data.versionNumber).toBe(1);
  });

  it("should reject publish with 409 Conflict if revision diverged", async () => {
    // Revision is now 3; client sends 2
    const res = await router.request("/pages/page_admin_test_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 2,
      }),
    });

    expect(res.status).toBe(409);
  });

  it("should route through module root router properly", async () => {
    const res = await rootRouter.request("/admin/pages/page_admin_test_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 3,
        draftAst: { test: true },
      }),
    });

    expect(res.status).toBe(200);
  });

  it("should list version history snapshots with metadata", async () => {
    const res = await router.request("/pages/page_admin_test_1/versions", {
      method: "GET",
      headers: {
        "x-tenant-id": "org_admin_pages",
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      versions: Array<{ versionNumber: number; label?: string; astSnapshot: Record<string, unknown> }>;
    };
    expect(data.versions.length).toBeGreaterThanOrEqual(1);
    expect(data.versions[0]?.versionNumber).toBe(1);
    expect(data.versions[0]?.label).toBe("Release v1");
  });

  it("should rollback page to prior version snapshot cleanly", async () => {
    // Current revision after previous tests is 3 (updated in rootRouter test)
    const res = await router.request("/pages/page_admin_test_1/versions/1/rollback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 4,
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success: boolean;
      revision: number;
      restoredVersion: number;
      draftAst: Record<string, unknown>;
    };
    expect(data.success).toBe(true);
    expect(data.restoredVersion).toBe(1);
    expect(data.revision).toBe(5);
  });

  it("should reject rollback with 409 Conflict if expectedRevision diverged", async () => {
    // Revision is now 5; client sends 4
    const res = await router.request("/pages/page_admin_test_1/versions/1/rollback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_admin_pages",
      },
      body: JSON.stringify({
        expectedRevision: 4,
      }),
    });

    expect(res.status).toBe(409);
  });
});
