import { describe, expect, it } from "vitest";
import {
  APP_MANIFESTS,
  getAppSettingsDefinition,
  isInstalledAppSettingsMetadataKey,
  validateAppSettings,
} from "../src/index.js";

const WEBSITE_BUILDER = "website-builder";

function websiteBuilderDefinition() {
  const definition = getAppSettingsDefinition(WEBSITE_BUILDER);
  if (definition === null) {
    throw new Error("The Website Builder settings definition is missing.");
  }
  return definition;
}

describe("app settings registry (T090)", () => {
  it("registers a settings definition for every compiled manifest", () => {
    for (const appId of Object.keys(APP_MANIFESTS)) {
      expect(getAppSettingsDefinition(appId), appId).not.toBeNull();
    }
  });

  it("returns null for an application outside the compiled registry", () => {
    expect(getAppSettingsDefinition("not-a-registered-app")).toBeNull();
  });

  it("declares a scope and a schema default for every field", () => {
    for (const field of websiteBuilderDefinition().fields) {
      expect(["app", "tenant"]).toContain(field.scope);
      expect(field.defaultValue).toBeDefined();
      expect(validateAppSettings(websiteBuilderDefinition(), {
        [field.key]: field.defaultValue,
      }).success).toBe(true);
    }
  });

  it("keeps configuration keys disjoint from install metadata", () => {
    for (const appId of Object.keys(APP_MANIFESTS)) {
      const definition = getAppSettingsDefinition(appId);
      if (definition === null) {
        throw new Error(`Missing settings definition for ${appId}`);
      }
      for (const field of definition.fields) {
        expect(isInstalledAppSettingsMetadataKey(field.key), field.key).toBe(
          false
        );
      }
    }
  });
});

describe("app settings validation", () => {
  it("accepts an empty object when every declared field is optional", () => {
    const result = validateAppSettings(websiteBuilderDefinition(), {});

    expect(result.success).toBe(true);
  });

  it("accepts the declared fields and trims text values", () => {
    const result = validateAppSettings(websiteBuilderDefinition(), {
      customDomainEnabled: true,
      defaultLocale: "  en-IN  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.values).toEqual({
        customDomainEnabled: true,
        defaultLocale: "en-IN",
      });
    }
  });

  it("rejects an undeclared key with a field-level issue", () => {
    const result = validateAppSettings(websiteBuilderDefinition(), {
      arbitraryKey: "value",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual([
        { name: "arbitraryKey", reason: "Unknown setting." },
      ]);
    }
  });

  it("rejects a value of the wrong type", () => {
    const result = validateAppSettings(websiteBuilderDefinition(), {
      customDomainEnabled: "yes",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.name).toBe("customDomainEnabled");
    }
  });

  it("rejects a locale outside the declared format", () => {
    const result = validateAppSettings(websiteBuilderDefinition(), {
      defaultLocale: "not a locale",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0]?.name).toBe("defaultLocale");
    }
  });

  it("rejects a non-object payload at the root", () => {
    const result = validateAppSettings(websiteBuilderDefinition(), ["array"]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toEqual([
        { name: "values", reason: "Settings must be a JSON object." },
      ]);
    }
  });
});
