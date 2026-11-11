import { describe, expect, it } from "vitest";
import { toStorefrontPath } from "../src/lib/storefront/path";

describe("storefront path guard (FR-114, FR-039)", () => {
  it("maps the root and ordinary segments to a page address", () => {
    expect(toStorefrontPath(undefined)).toBe("/");
    expect(toStorefrontPath([])).toBe("/");
    expect(toStorefrontPath(["about"])).toBe("/about");
    expect(toStorefrontPath(["rooms", "river-view"])).toBe("/rooms/river-view");
  });

  it.each([
    ["dashboard"],
    ["login"],
    ["api"],
    ["preview"],
    ["sitemap.xml"],
    ["robots.txt"],
    [".well-known", "security.txt"],
  ])("never claims the reserved address %s", (...segments: string[]) => {
    expect(toStorefrontPath(segments)).toBeNull();
  });

  it.each([
    [[".."]],
    [["about", ".."]],
    [["about\\rooms"]],
    [[""]],
    [["about", ""]],
    [["about", "River View"]],
    [["about", "UPPER"]],
  ])("rejects a traversal or malformed address %j", (segments: string[]) => {
    expect(toStorefrontPath(segments)).toBeNull();
  });

  it("only accepts canonical lower-case addresses", () => {
    expect(toStorefrontPath(["about-"])).toBeNull();
    expect(toStorefrontPath(["about"])).toBe("/about");
  });
});
