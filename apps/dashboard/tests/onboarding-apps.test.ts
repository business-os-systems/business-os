import { describe, expect, it } from "vitest";
import { APP_MANIFESTS, getAppManifest } from "@suite/core";
import {
  describeTargetIndustries,
  groupApps,
  groupOnboardingApps,
  isAppRecommended,
  listOnboardingApps,
} from "../src/lib/onboarding-apps";

const WEBSITE_BUILDER = "website-builder";
const HOSPITALITY = "Hospitality & Lodging";

describe("onboarding app registry", () => {
  it("lists exactly the applications declared by the compiled registry", () => {
    expect(listOnboardingApps()).toEqual(Object.values(APP_MANIFESTS));
  });

  it("recommends a universal app regardless of the tenant industries", () => {
    const manifest = getAppManifest(WEBSITE_BUILDER);
    if (!manifest) {
      throw new Error("website-builder must be registered in @suite/core");
    }

    expect(manifest.targetIndustries).toEqual(["*"]);
    expect(isAppRecommended(manifest, [])).toBe(true);
    expect(isAppRecommended(manifest, [HOSPITALITY])).toBe(true);
  });

  it("recommends an industry app only when one target industry matches", () => {
    const manifest = getAppManifest(WEBSITE_BUILDER);
    if (!manifest) {
      throw new Error("website-builder must be registered in @suite/core");
    }
    const hospitalityApp = {
      ...manifest,
      targetIndustries: [HOSPITALITY, "Real Estate & Property"],
    };

    expect(isAppRecommended(hospitalityApp, [HOSPITALITY])).toBe(true);
    expect(isAppRecommended(hospitalityApp, ["Retail & E-Commerce"])).toBe(false);
    expect(isAppRecommended(hospitalityApp, [])).toBe(false);
    expect(describeTargetIndustries(hospitalityApp)).toBe(
      "Hospitality & Lodging · Real Estate & Property"
    );
  });

  it("partitions the registry into recommended and additional apps", () => {
    const groups = groupOnboardingApps([]);

    expect(groups.recommended.map((app) => app.appId)).toEqual([WEBSITE_BUILDER]);
    expect(groups.additional).toEqual([]);
  });
});

  it("groups a non-universal app as additional", () => {
    const manifest = getAppManifest(WEBSITE_BUILDER);
    if (!manifest) throw new Error("website-builder must be registered");
    const hospitality = {
      ...manifest,
      appId: "lodging-pms",
      targetIndustries: [HOSPITALITY],
    };
    const groups = groupApps([manifest, hospitality], []);
    expect(groups.recommended.map((app) => app.appId)).toEqual([
      WEBSITE_BUILDER,
    ]);
    expect(groups.additional.map((app) => app.appId)).toEqual(["lodging-pms"]);
  });
