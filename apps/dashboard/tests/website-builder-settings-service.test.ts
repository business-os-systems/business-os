import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_ERROR_CODE } from "@suite/core";
import { readWebsiteBuilderConfiguration } from "../src/services/website-builder-settings.service";

const state = vi.hoisted(
  (): { cookie: string | undefined } => ({ cookie: "session-token" })
);

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        state.cookie === undefined ? undefined : { name, value: state.cookie },
    }),
}));

const NOW = "2026-11-12T00:00:00.000Z";
const SETTINGS = {
  appId: "website-builder",
  fields: [
    {
      key: "customDomainEnabled",
      label: "Custom domains",
      description: "Allow this tenant to attach custom domains.",
      required: false,
      scope: "tenant",
      defaultValue: false,
      kind: "boolean",
    },
    {
      key: "defaultLocale",
      label: "Default locale",
      description: "Locale used for new sites.",
      required: false,
      scope: "tenant",
      defaultValue: "en",
      kind: "text",
      minLength: 2,
      maxLength: 35,
      format: "bcp47",
    },
  ],
  effectiveValues: { customDomainEnabled: false, defaultLocale: "en" },
  sources: { customDomainEnabled: "schema", defaultLocale: "schema" },
};

function envelope(data: unknown): unknown {
  return { success: true, data, requestId: "req-settings", timestamp: NOW };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

beforeEach(() => {
  state.cookie = "session-token";
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(jsonResponse(200, envelope({ settings: SETTINGS }))))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("website builder effective settings", () => {
  it("shows the schema default and its source when no override exists", async () => {
    const result = await readWebsiteBuilderConfiguration();

    if (result.kind !== "ready") {
      throw new Error("Expected a ready settings read, received " + result.kind);
    }
    expect(result.fields).toEqual([
      {
        key: "customDomainEnabled",
        label: "Custom domains",
        description: "Allow this tenant to attach custom domains.",
        displayValue: "Disabled",
        source: "schema",
      },
      {
        key: "defaultLocale",
        label: "Default locale",
        description: "Locale used for new sites.",
        displayValue: "en",
        source: "schema",
      },
    ]);
  });

  it("forwards the session cookie and never a workspace id", async () => {
    await readWebsiteBuilderConfiguration();

    const call = vi.mocked(fetch).mock.calls[0];
    expect(call?.[0]).toBe("http://localhost:4000/api/v1/cms/settings");
    const init = call?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("cookie")).toBe("__Host-bos_session=session-token");
  });

});

describe("website builder settings failures", () => {
  it("reports a missing installation instead of inventing settings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(403, {
            type: "/errors/app-not-installed",
            title: "Application not installed",
            status: 403,
            code: PLATFORM_ERROR_CODE.APP_NOT_INSTALLED,
            detail: "The Website Builder application is not installed for this workspace.",
          })
        )
      )
    );

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({ kind: "not_installed" });
  });

  it("returns the server's problem detail when the settings read fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(503, {
            type: "/errors/dependency-unavailable",
            title: "Dependency unavailable",
            status: 503,
            code: PLATFORM_ERROR_CODE.DEPENDENCY_UNAVAILABLE,
            detail: "The settings service is unavailable.",
          })
        )
      )
    );

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({
      kind: "unavailable",
      message: "The settings service is unavailable.",
    });
  });
});

describe("website builder settings contract breaches", () => {
  it("reports a missing session before calling the API", async () => {
    state.cookie = undefined;

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({
      kind: "unavailable",
      message: "An authenticated workspace session is required to read settings.",
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("reports a non-problem failure with the HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(503, "gateway down")))
    );

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({
      kind: "unavailable",
      message: "The settings request failed with status 503.",
    });
  });

  it("refuses a response that does not match the settings contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(jsonResponse(200, { success: true, data: { settings: {} } }))
      )
    );

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({
      kind: "unavailable",
      message: "The settings response did not match the expected contract.",
    });
  });

});

describe("website builder settings contract omissions", () => {
  it("reports an omitted effective value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            200,
            envelope({
              settings: {
                ...SETTINGS,
                effectiveValues: { customDomainEnabled: false },
              },
            })
          )
        )
      )
    );

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({
      kind: "unavailable",
      message: "The settings response omitted the effective value for defaultLocale.",
    });
  });

  it("reports an omitted source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            200,
            envelope({
              settings: { ...SETTINGS, sources: { customDomainEnabled: "schema" } },
            })
          )
        )
      )
    );

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({
      kind: "unavailable",
      message: "The settings response omitted the source for defaultLocale.",
    });
  });

  it("reports a transport failure verbatim", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("socket closed"))));

    const result = await readWebsiteBuilderConfiguration();

    expect(result).toEqual({ kind: "unavailable", message: "socket closed" });
  });
});
