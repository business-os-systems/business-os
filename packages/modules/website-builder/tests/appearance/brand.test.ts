import { describe, expect, it } from "vitest";
import { isSafeBrandLogoUrl } from "../../src/appearance/brand.js";

describe("brand logo URL validation (ASVS V5.1, CWE-79)", () => {
  it("accepts a workspace media path and an absolute HTTPS URL", () => {
    expect(isSafeBrandLogoUrl("/media/logos/river-view.svg")).toBe(true);
    expect(isSafeBrandLogoUrl("https://cdn.example.test/logo.png?v=2")).toBe(true);
  });

  it("refuses script, data and protocol-relative values", () => {
    expect(isSafeBrandLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeBrandLogoUrl("data:image/svg+xml,<svg/>")).toBe(false);
    expect(isSafeBrandLogoUrl("//evil.example.test/logo.png")).toBe(false);
    expect(isSafeBrandLogoUrl("/\\evil.example.test/logo.png")).toBe(false);
  });

  it("refuses HTTP, credentials and overlong values", () => {
    expect(isSafeBrandLogoUrl("http://cdn.example.test/logo.png")).toBe(false);
    expect(isSafeBrandLogoUrl("https://user:secret@cdn.example.test/logo.png")).toBe(false);
    expect(isSafeBrandLogoUrl("/" + "a".repeat(2048))).toBe(false);
  });
});
