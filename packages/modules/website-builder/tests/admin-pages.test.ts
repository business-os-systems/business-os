import { describe, expect, it } from "vitest";
import {
  createAdminPagesRouter,
  PageService,
  createWebsiteBuilderRoutes,
} from "../src/index.js";

describe("Authoring Studio Management APIs & CAS Concurrency (S1-7)", () => {
  const service = new PageService();
  const router = createAdminPagesRouter(service);
  const rootRouter = createWebsiteBuilderRoutes(service);

  it("should update draft content when expectedRevision matches active revision", async () => {
    const res = await router.request("/pages/page_demo_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_alpha",
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
    const res = await router.request("/pages/page_demo_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_alpha",
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
    };
    expect(data.type).toContain("concurrency-conflict");
    expect(data.status).toBe(409);
    expect(data.activeRevision).toBe(2);
  });

  it("should return 404 when attempting to mutate page of a different tenant", async () => {
    const res = await router.request("/pages/page_demo_1/content", {
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
    const res = await router.request("/pages/page_demo_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_alpha",
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
    const res = await router.request("/pages/page_demo_1/publish", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_alpha",
      },
      body: JSON.stringify({
        expectedRevision: 2,
      }),
    });

    expect(res.status).toBe(409);
  });

  it("should route through module root router properly", async () => {
    const res = await rootRouter.request("/admin/pages/page_demo_1/content", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_alpha",
      },
      body: JSON.stringify({
        expectedRevision: 3,
        draftAst: { test: true },
      }),
    });

    expect(res.status).toBe(200);
  });
});
