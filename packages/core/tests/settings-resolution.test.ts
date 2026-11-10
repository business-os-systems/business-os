import { describe, expect, it } from "vitest";
import {
  getAppSettingsDefinition,
  resolveAppSettings,
  validateAppSettings,
  validateTenantAppSettings,
} from "../src/index.js";

function definition() {
  const value = getAppSettingsDefinition("website-builder");
  if (value === null) throw new Error("Website Builder settings are not registered.");
  return value;
}

describe("@suite/core - settings resolution", () => {
  it("falls back to the schema default when neither layer has a value", () => {
    const resolved = resolveAppSettings(definition(), {
      appDefaults: {},
      tenantOverrides: {},
    });
    expect(resolved.values).toEqual({
      customDomainEnabled: false,
      defaultLocale: "en",
    });
    expect(resolved.sources).toEqual({
      customDomainEnabled: "schema",
      defaultLocale: "schema",
    });
  });

  it("prefers an application default over the schema default", () => {
    const resolved = resolveAppSettings(definition(), {
      appDefaults: { customDomainEnabled: true },
      tenantOverrides: {},
    });
    expect(resolved.values.customDomainEnabled).toBe(true);
    expect(resolved.sources.customDomainEnabled).toBe("app");
    expect(resolved.sources.defaultLocale).toBe("schema");
  });

  it("prefers a tenant override over both lower layers", () => {
    const resolved = resolveAppSettings(definition(), {
      appDefaults: { defaultLocale: "en-GB" },
      tenantOverrides: { defaultLocale: "en-IN" },
    });
    expect(resolved.values.defaultLocale).toBe("en-IN");
    expect(resolved.sources.defaultLocale).toBe("tenant");
  });

  it("ignores keys outside the compiled definition", () => {
    const resolved = resolveAppSettings(definition(), {
      appDefaults: { unknown: "ignored" },
      tenantOverrides: { alsoUnknown: true },
    });
    expect(resolved.values).not.toHaveProperty("unknown");
    expect(resolved.values).not.toHaveProperty("alsoUnknown");
  });

  it("rejects unknown keys at both scopes", () => {
    const app = validateAppSettings(definition(), { unknown: true });
    expect(app.success).toBe(false);
    const tenant = validateTenantAppSettings(definition(), { unknown: true });
    expect(tenant.success).toBe(false);
  });
});
