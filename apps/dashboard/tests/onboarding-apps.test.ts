import { describe, expect, it } from "vitest";
import { APP_MANIFESTS, getAppManifest } from "@suite/core";
import {
  describeTargetIndustries,
  groupOnboardingApps,
  isAppRecommended,
  listOnboardingApps,
} from "../src/lib/onboarding-apps";

describe("onboarding app registry", () => {
  it("lists exactly the applications declared by the compiled registry", () => {
    expect(listOnboardingApps()).toEqual(Object.values(APP_MANIFESTS));
  });

  it("recommends a universal app regardless of the tenant industries", () => {
    const manifest = getAppManifest("website-builder");
    if (!manifest) {
      throw new Error("website-builder must be registered in @suite/core");
    }

    expect(manifest.targetIndustries).toEqual(["*"]);
    expect(isAppRecommended(manifest, [])).toBe(true);
    expect(isAppRecommended(manifest, ["Hospitality & Lodging"])).toBe(true);
  });

  it("recommends an industry app only when one target industry matches", () => {
    const manifest = getAppManifest("website-builder");
    if (!manifest) {
      throw new Error("website-builder must be registered in @suite/core");
    }
    const hospitalityApp = {
      ...manifest,
      targetIndustries: ["Hospitality & Lodging", "Real Estate & Property"],
    };

    expect(isAppRecommended(hospitalityApp, ["Hospitality & Lodging"])).toBe(true);
    expect(isAppRecommended(hospitalityApp, ["Retail & E-Commerce"])).toBe(false);
    expect(isAppRecommended(hospitalityApp, [])).toBe(false);
    expect(describeTargetIndustries(hospitalityApp)).toBe(
      "Hospitality & Lodging · Real Estate & Property"
    );
  });

  it("partitions the registry into recommended and additional apps", () => {
    const groups = groupOnboardingApps([]);

    expect(groups.recommended.map((app) => app.appId)).toEqual(["website-builder"]);
    expect(groups.additional).toEqual([]);
  });
});
