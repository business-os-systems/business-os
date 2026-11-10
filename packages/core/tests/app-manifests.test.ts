import { describe, expect, it } from "vitest";
import { APP_MANIFESTS, getAppManifest } from "../src/index.js";

const ICON_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

describe("app manifest metadata", () => {
  it("declares an icon registry key for every compiled manifest", () => {
    for (const manifest of Object.values(APP_MANIFESTS)) {
      expect(manifest.iconKey, manifest.appId).toMatch(ICON_KEY_PATTERN);
    }
  });

  it("declares at least one target industry for every compiled manifest", () => {
    for (const manifest of Object.values(APP_MANIFESTS)) {
      expect(manifest.targetIndustries.length, manifest.appId).toBeGreaterThan(0);
      for (const industry of manifest.targetIndustries) {
        expect(industry.trim(), manifest.appId).not.toBe("");
      }
    }
  });

  it("marks Website Builder as universal so onboarding always recommends it", () => {
    const manifest = getAppManifest("website-builder");

    expect(manifest?.iconKey).toBe("sites");
    expect(manifest?.targetIndustries).toEqual(["*"]);
  });
});
