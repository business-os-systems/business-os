import { describe, expect, it } from "vitest";
import { createCmsRouter } from "../src/routes/cms/index.js";

/**
 * A router that exists but is never mounted is unreachable, which is exactly
 * how the studio lost its content, catalog, review, version and appearance
 * endpoints. Assert the assembled router carries each surface.
 */
describe("CMS router assembly", () => {
  const paths = createCmsRouter().routes.map((route) => route.path);

  it.each([
    "/pages/:pageId/content",
    "/catalog/sections",
    "/sites/:siteId/review",
    "/pages/:pageId/versions",
    "/sites/:siteId/appearance",
  ])("mounts %s", (path) => {
    expect(paths).toContain(path);
  });
});
