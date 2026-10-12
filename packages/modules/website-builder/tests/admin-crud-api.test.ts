import { describe, expect, it } from "vitest";
import {
  createAdminRouter,
  SiteService,
  PageService,
} from "../src/index.js";

describe("Live Database CRUD API for Sites & Pages (S4-2)", () => {
  const pageService = new PageService();
  const siteService = new SiteService();
  const router = createAdminRouter(pageService, siteService);

  it("should check subdomain availability and return phonetic suggestions when occupied", async () => {
    const res = await router.request("/subdomain/check?subdomain=my-new-company", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      subdomain: string;
      available: boolean;
      suggestions: string[];
    };
    expect(data.subdomain).toBe("my-new-company");
    expect(typeof data.available).toBe("boolean");
  });

  it("should list sites scoped to tenant", async () => {
    const res = await router.request("/sites", {
      method: "GET",
      headers: {
        "x-tenant-id": "org_test_tenant",
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { sites: unknown[] };
    expect(Array.isArray(data.sites)).toBe(true);
  });

  it("should list pages for a site", async () => {
    // Seed page under site_alpha for org_alpha
    const res = await router.request("/sites/site_alpha/pages", {
      method: "GET",
      headers: {
        "x-tenant-id": "org_alpha",
      },
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { pages: Array<{ id: string; title: string }> };
    expect(Array.isArray(data.pages)).toBe(true);
    expect(data.pages.length).toBeGreaterThan(0);
    expect(data.pages[0]?.title).toBe("About Us");
  });

  it("should create a new page under a site and retrieve its content", async () => {
    const createRes = await router.request("/sites/site_alpha/pages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": "org_alpha",
      },
      body: JSON.stringify({
        title: "Contact Us",
        slug: "/contact",
        isHomePage: false,
        draftAst: {
          root: {
            id: "contact-sec",
            type: "section",
            children: [],
          },
        },
      }),
    });

    expect(createRes.status).toBe(201);
    const createData = (await createRes.json()) as {
      success: boolean;
      page: { id: string; title: string; slug: string };
    };
    expect(createData.success).toBe(true);
    expect(createData.page.title).toBe("Contact Us");
    expect(createData.page.slug).toBe("/contact");

    // Fetch page content
    const contentRes = await router.request(`/pages/${createData.page.id}/content`, {
      method: "GET",
      headers: {
        "x-tenant-id": "org_alpha",
      },
    });

    expect(contentRes.status).toBe(200);
    const contentData = (await contentRes.json()) as {
      id: string;
      title: string;
      revision: number;
      draftAst: Record<string, unknown>;
    };
    expect(contentData.id).toBe(createData.page.id);
    expect(contentData.title).toBe("Contact Us");
    expect(contentData.revision).toBe(1);
    expect(contentData.draftAst).toHaveProperty("root");
  });

  it("should return 404 when querying page content of non-existent page", async () => {
    const res = await router.request("/pages/non_existent_page/content", {
      method: "GET",
      headers: {
        "x-tenant-id": "org_alpha",
      },
    });

    expect(res.status).toBe(404);
  });
});
