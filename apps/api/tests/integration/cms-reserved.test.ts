import { describe, expect, it } from "vitest";
import { RESERVED_HOST_LABELS, RESERVED_PATH_PREFIXES } from "@suite/core";
import {
  assertPagePathAllowed,
  normalizePagePath,
  normalizeSiteSlug,
} from "@suite/website-builder/paths";
import { createPage } from "../../src/services/cms/page-service.js";

const RESERVED_PATHS_REQUIRED = [
  "/dashboard",
  "/login",
  "/api",
  "/preview",
  "/sitemap.xml",
  "/robots.txt",
  "/.well-known",
] as const;

function thrownBy(action: () => void): unknown {
  try {
    action();
    return null;
  } catch (error: unknown) {
    return error;
  }
}

describe("CMS reserved address matrix (T082, FR-021)", () => {
  it.each(RESERVED_HOST_LABELS)("refuses the reserved site label %s", (label) => {
    expect(thrownBy(() => normalizeSiteSlug(label))).toMatchObject({ code: "RESERVED_SLUG" });
    expect(thrownBy(() => normalizeSiteSlug(label.toUpperCase()))).toMatchObject({
      code: "RESERVED_SLUG",
    });
  });

  it("normalizes and accepts a non-reserved site label", () => {
    expect(normalizeSiteSlug("  River View Bistro  ")).toBe("river-view-bistro");
    expect(normalizeSiteSlug("Stay_2026")).toBe("stay-2026");
  });

  for (const prefix of RESERVED_PATHS_REQUIRED) {
    it("refuses the reserved path " + prefix + " and its subtree", () => {
      const variants = [prefix, prefix + "/", prefix + "/child", prefix.slice(1), prefix.toUpperCase()];
      for (const variant of variants) {
        expect(thrownBy(() => assertPagePathAllowed(normalizePagePath(variant)))).toMatchObject({
          code: "RESERVED_PATH",
        });
      }
    });
  }

  it("covers every canonical reserved prefix", () => {
    for (const prefix of RESERVED_PATH_PREFIXES) {
      expect(thrownBy(() => assertPagePathAllowed(normalizePagePath(prefix)))).not.toBeNull();
    }
  });

  it("accepts nested and hyphenated page addresses", () => {
    for (const path of ["/", "/about", "/rooms/deluxe", "/stay-2026"]) {
      const normalized = normalizePagePath(path);
      expect(() => assertPagePathAllowed(normalized)).not.toThrow();
    }
    expect(normalizePagePath("Rooms/Deluxe/")).toBe("/rooms/deluxe");
  });

  it("refuses traversal and malformed page addresses", () => {
    for (const path of ["/../etc/passwd", "/a/../../b", "/%2e%2e/secret", "/About Us", "/x_y"]) {
      expect(
        thrownBy(() => assertPagePathAllowed(normalizePagePath(path)))
      ).not.toBeNull();
    }
  });

  it("refuses a reserved path before any database work", async () => {
    await expect(
      createPage({
        organizationId: "org_reserved_matrix",
        siteId: "site_reserved_matrix",
        actorUserId: "usr_matrix",
        body: { title: "Shadow dashboard", path: "/dashboard" },
      })
    ).rejects.toMatchObject({ code: "RESERVED_PATH" });
  });
});
