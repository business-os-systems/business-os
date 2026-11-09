import { describe, expect, it } from "vitest";
import { isTemplateSecret } from "@suite/core";
import {
  assertProductionConfiguration,
  getControlPlaneOrigin,
  getCorsAllowedOrigins,
  getPublicApiUrl,
  getTrustedProxyIps,
  isInternalDocsEnabled,
} from "../src/lib/env.js";

const REAL_SECRET = "9f".repeat(24);

function productionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    BETTER_AUTH_SECRET: REAL_SECRET,
    METRICS_AUTH_TOKEN: REAL_SECRET,
    GDPR_HMAC_SALT_KEY: REAL_SECRET,
    CONTROL_SESSION_SECRET: REAL_SECRET,
    TURNSTILE_SECRET_KEY: REAL_SECRET,
    TRUSTED_PROXY_IPS: "10.0.0.10",
    ...overrides,
  };
}

describe("production configuration guard", () => {
  it("starts when every secret is generated and the proxies are declared", () => {
    expect(() => assertProductionConfiguration(productionEnv())).not.toThrow();
  });

  it("refuses a secret copied from a published template", () => {
    expect(() =>
      assertProductionConfiguration(
        productionEnv({
          BETTER_AUTH_SECRET:
            "business-os-enterprise-session-signing-secret-key-32ch-min",
        })
      )
    ).toThrow(/BETTER_AUTH_SECRET/);
  });

  it("refuses a CHANGE_ME placeholder", () => {
    expect(() =>
      assertProductionConfiguration(
        productionEnv({ GDPR_HMAC_SALT_KEY: "CHANGE_ME_GDPR_SALT" })
      )
    ).toThrow(/GDPR_HMAC_SALT_KEY/);
  });

  it("refuses an empty mandatory secret", () => {
    expect(() =>
      assertProductionConfiguration(
        productionEnv({ CONTROL_SESSION_SECRET: "   " })
      )
    ).toThrow(/CONTROL_SESSION_SECRET/);
  });

  it("refuses to start with an empty proxy list", () => {
    expect(() =>
      assertProductionConfiguration(productionEnv({ TRUSTED_PROXY_IPS: "  ,  " }))
    ).toThrow(/TRUSTED_PROXY_IPS/);
  });

  it("leaves non-production runtimes alone", () => {
    expect(() =>
      assertProductionConfiguration({
        NODE_ENV: "development",
        BETTER_AUTH_SECRET: "CHANGE_ME",
      })
    ).not.toThrow();
  });

  it("parses and trims the proxy list", () => {
    expect(getTrustedProxyIps({ TRUSTED_PROXY_IPS: " 10.0.0.1 , 10.0.0.2 , " })).toEqual([
      "10.0.0.1",
      "10.0.0.2",
    ]);
  });

  it("recognises template secrets by prefix and by published value", () => {
    expect(isTemplateSecret("CHANGE_ME_SECRET")).toBe(true);
    expect(isTemplateSecret("metrics-secure-telemetry-token-dev")).toBe(true);
    expect(isTemplateSecret(REAL_SECRET)).toBe(false);
  });
});

describe("typed runtime configuration", () => {
  it("parses the CORS whitelist", () => {
    expect(
      getCorsAllowedOrigins({
        CORS_ALLOWED_ORIGINS: " https://a.example.com , https://b.example.com , ",
      })
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
    expect(getCorsAllowedOrigins({})).toEqual([]);
  });

  it("reads the optional control-plane origin as null when absent", () => {
    expect(
      getControlPlaneOrigin({ CONTROL_PLANE_ORIGIN: " https://ops.example.com " })
    ).toBe("https://ops.example.com");
    expect(getControlPlaneOrigin({})).toBeNull();
  });

  it("reads the docs guard and public API URL without inline defaults", () => {
    expect(isInternalDocsEnabled({ ENABLE_INTERNAL_DOCS: "true" })).toBe(true);
    expect(isInternalDocsEnabled({ ENABLE_INTERNAL_DOCS: "false" })).toBe(false);
    expect(getPublicApiUrl({ API_URL: "https://api.example.com" })).toBe(
      "https://api.example.com"
    );
    expect(getPublicApiUrl({})).toBe("/");
  });
});
