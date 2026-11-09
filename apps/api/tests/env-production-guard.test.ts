import { describe, expect, it } from "vitest";
import { isTemplateSecret } from "@suite/core";
import {
  assertProductionConfiguration,
  getBetterAuthSecret,
  getControlPlaneOrigin,
  getCorsAllowedOrigins,
  getDashboardUrl,
  getMetricsAuthToken,
  getPublicApiUrl,
  getSentryDsn,
  getServerPort,
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
function withEnv<T>(key: string, value: string | undefined, run: () => T): T {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

describe("typed runtime getters", () => {
  it("fails loudly when a mandatory variable is absent", () => {
    expect(() => withEnv("BETTER_AUTH_SECRET", undefined, getBetterAuthSecret)).toThrow(
      /BETTER_AUTH_SECRET/
    );
    expect(() => withEnv("METRICS_AUTH_TOKEN", undefined, getMetricsAuthToken)).toThrow(
      /METRICS_AUTH_TOKEN/
    );
    expect(() => withEnv("DASHBOARD_URL", undefined, getDashboardUrl)).toThrow(
      /DASHBOARD_URL/
    );
  });

  it("normalises the dashboard origin without a trailing slash", () => {
    expect(
      withEnv("DASHBOARD_URL", "https://app.example.com/", getDashboardUrl)
    ).toBe("https://app.example.com");
  });

  it("validates PORT as a real TCP port", () => {
    expect(withEnv("PORT", "4000", getServerPort)).toBe(4000);
    expect(() => withEnv("PORT", "not-a-port", getServerPort)).toThrow(/PORT/);
    expect(() => withEnv("PORT", "70000", getServerPort)).toThrow(/PORT/);
  });

  it("reads an absent Sentry DSN as deliberately disabled", () => {
    expect(withEnv("SENTRY_DSN", "", getSentryDsn)).toBeNull();
    expect(withEnv("SENTRY_DSN", "https://key@sentry.example/1", getSentryDsn)).toBe(
      "https://key@sentry.example/1"
    );
  });
});
