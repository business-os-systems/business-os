import { describe, expect, it } from "vitest";
import {
  WEBSITE_BUILDER_MODULE_VERSION,
  WebsiteBuilderService,
  createWebsiteBuilderRoutes,
  AstBlockSchema,
  WebsiteBuilderEventType,
} from "../src/index.js";

describe("@suite/website-builder Package Scaffold Verification", () => {
  it("should export module version and valid service instance", () => {
    expect(WEBSITE_BUILDER_MODULE_VERSION).toBe("0.1.0");

    const service = new WebsiteBuilderService();
    const health = service.healthCheck();
    expect(health.status).toBe("healthy");
    expect(health.module).toBe("@suite/website-builder");
  });

  it("should initialize routes and return health status", async () => {
    const router = createWebsiteBuilderRoutes();
    const res = await router.request("/health");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      status: "ok",
      module: "@suite/website-builder",
    });
  });

  it("should validate AstBlockSchema correctly", () => {
    const validBlock = {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      type: "hero_section",
      props: { headline: "Welcome" },
      children: [],
    };

    const parsed = AstBlockSchema.safeParse(validBlock);
    expect(parsed.success).toBe(true);
  });

  it("should define expected domain events", () => {
    expect(WebsiteBuilderEventType.PAGE_PUBLISHED).toBe("cms.page.published");
    expect(WebsiteBuilderEventType.FORM_SUBMITTED).toBe("cms.form.submitted");
  });
});
