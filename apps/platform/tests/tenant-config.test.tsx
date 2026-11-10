// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import TenantAppsPage from "../src/app/(platform)/tenants/[orgId]/apps/page";
import { AppSettingsEditor } from "../src/app/(platform)/tenants/[orgId]/apps/app-settings-editor";
import TenantQuotasPage from "../src/app/(platform)/tenants/[orgId]/quotas/page";
import { QuotaEditorModal } from "../src/app/(platform)/tenants/[orgId]/quotas/quota-editor-modal";
import { TenantRecordProvider } from "../src/app/(platform)/tenants/[orgId]/tenant-record-context";
import { PlatformShell } from "../src/components/layout/platform-shell";
import { ConfigTable } from "../src/components/tables/config-table";
import {
  QUOTA_TABLE_CONFIG,
  buildQuotaItem,
  validateQuotaForm,
} from "../src/components/quotas/quotas.config";
import {
  buildSettingsFormFields,
  buildSettingsPayload,
  validateSettingsForm,
} from "../src/components/settings/app-settings.config";
import { mapInvalidParams } from "../src/components/forms/invalid-params";
import { IDEMPOTENCY_HEADER } from "../src/lib/api";
import type { AppSettingsView } from "../src/lib/app-settings-api";
import type { QuotaItem } from "../src/lib/quotas-api";
import type { TenantRecord } from "../src/lib/tenant-api";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));
const navState = vi.hoisted(() => ({
  pathname: "/tenants/org_1/apps",
  params: { orgId: "org_1" },
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
  useRouter: () => ({
    push: navState.push,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useParams: () => navState.params,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../src/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: {
      operator: { id: "op_1", email: "ops@example.com", displayName: "Ops" },
      capabilities: authState.capabilities,
    },
    loading: false,
    error: null,
    signOutFailed: false,
    refresh: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    forceSignOut: () => undefined,
  }),
}));

const ORG_ID = "org_1";
const APPS_CAPABILITIES = [
  PLATFORM_CAPABILITIES.TENANTS_READ.code,
  PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
];
const APP_ID = "website-builder";
const ORG_PATH = `http://api.test/api/v1/admin/tenants/${ORG_ID}`;
const TEXT_INPUT = 'input[type="text"]';
const BRANCHES_KEY = "core.branches";
const MEMBERS_KEY = "core.members";
const QUOTA_FORM_MISSING = "Quota form missing";
const SETTINGS_FORM_MISSING = "Settings form missing";
const CAPABILITY_DENIED_TEXT = "Capability denied";
const LEGACY_FIELD = "legacyFlag";
const UNKNOWN_SETTING = "Unknown setting.";

const SETTINGS: AppSettingsView = {
  appId: APP_ID,
  schema: {
    fields: [
      {
        key: "customDomainEnabled",
        label: "Custom domains",
        description: "Allow custom domains.",
        required: false,
        scope: "tenant",
        defaultValue: false,
        kind: "boolean",
      },
      {
        key: "defaultLocale",
        label: "Default locale",
        description: "Locale for new sites.",
        required: false,
        scope: "tenant",
        defaultValue: "en",
        kind: "text",
        minLength: 2,
        maxLength: 35,
        format: "bcp47",
      },
    ],
  },
  values: { customDomainEnabled: true, defaultLocale: "en-IN" },
  effectiveValues: { customDomainEnabled: true, defaultLocale: "en-IN" },
  sources: { customDomainEnabled: "tenant", defaultLocale: "tenant" },
  staleFields: [],
  version: "2026-11-07T10:00:00.000000Z",
};

const QUOTA: QuotaItem = {
  resourceKey: BRANCHES_KEY,
  limitValue: "5",
  unit: "count",
  currentValue: "2",
  isMeasurable: true,
  asOf: "2026-11-07T10:00:00.000Z",
  isEnforced: true,
  isOverLimit: false,
  version: "2026-11-07T10:00:00.000000Z",
};

const RECORD: TenantRecord = {
  profile: {
    id: ORG_ID,
    name: "River View",
    slug: "river-view",
    status: "ACTIVE",
    timezone: "Asia/Kolkata",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  counts: { asOf: "2026-01-01T00:00:00.000Z", branches: 1, members: 2 },
  apps: [APP_ID],
  quotas: [],
  lifecycle: [],
  lifecycleHasMore: false,
  recentAudit: [],
};

function withRecord(
  ui: React.ReactElement,
  record: TenantRecord = RECORD
): React.ReactElement {
  return (
    <TenantRecordProvider value={{ record, reload: () => undefined }}>
      {ui}
    </TenantRecordProvider>
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestJsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return JSON.parse(init.body);
}

function render(ui: React.ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setInputValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    element,
    value
  );
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Tenant record hub capability gates", () => {
  it("denies both panel routes without their capability", () => {
    expect(renderToString(withRecord(<TenantAppsPage />))).toContain(
      CAPABILITY_DENIED_TEXT
    );
    expect(renderToString(withRecord(<TenantQuotasPage />))).toContain(
      CAPABILITY_DENIED_TEXT
    );
  });

  it("keeps management panels gated beyond the tenant read gate", () => {
    // The shell inherits platform:tenants:read for /tenants/*; a read-only
    // operator sees the record and its read-only apps panel, while quota
    // management stays denied.
    authState.capabilities = [PLATFORM_CAPABILITIES.TENANTS_READ.code];
    expect(
      renderToString(
        <PlatformShell>
          <h1>Tenant hub</h1>
        </PlatformShell>
      )
    ).toContain("Tenant hub");
    expect(renderToString(withRecord(<TenantAppsPage />))).toContain(
      "Installed apps"
    );
    expect(renderToString(withRecord(<TenantQuotasPage />))).toContain(
      CAPABILITY_DENIED_TEXT
    );
  });
});

describe("Tenant apps panel states", () => {
  it("renders the application-settings loading state", () => {
    authState.capabilities = APPS_CAPABILITIES;
    expect(renderToString(withRecord(<TenantAppsPage />))).toContain(
      "Loading application settings"
    );
  });

  it("renders genuine empty states without installed apps", () => {
    authState.capabilities = APPS_CAPABILITIES;
    const html = renderToString(
      withRecord(<TenantAppsPage />, { ...RECORD, apps: [] })
    );
    expect(html).toContain("No installed apps");
    expect(html).toContain("No configurable application");
  });

  it("renders the RFC 7807 error detail", async () => {
    authState.capabilities = APPS_CAPABILITIES;
    fetchMock.mockResolvedValueOnce(
      reply(403, {
        type: "/errors/capability-denied",
        title: "Forbidden",
        status: 403,
        detail: "Capability denied.",
        code: "CAPABILITY_DENIED",
      })
    );
    render(withRecord(<TenantAppsPage />));
    await settle();
    expect(document.body.textContent).toContain("Capability denied.");
    expect(document.body.textContent).toContain("CAPABILITY_DENIED");
  });
});

function entitlementsReply(): Response {
  return reply(200, {
    data: {
      apps: RECORD.apps.map((appId) => ({
        appId,
        isEnabled: true,
        installedAt: "2026-01-01T00:00:00.000Z",
        version: "v1",
        branchOverrides: [],
      })),
    },
  });
}

describe("Tenant settings version reconciliation", () => {
  it("uses the newly written version for a second save", async () => {
    authState.capabilities = APPS_CAPABILITIES;
    fetchMock
      .mockResolvedValueOnce(reply(200, { data: SETTINGS }))
      .mockResolvedValueOnce(entitlementsReply())
      .mockResolvedValueOnce(
        reply(200, {
          data: {
            appId: APP_ID,
            values: SETTINGS.values,
            removedFields: [],
            staleFields: [],
            version: "settings-v2",
          },
        })
      )
      .mockResolvedValueOnce(
        reply(200, {
          data: {
            appId: APP_ID,
            values: SETTINGS.values,
            removedFields: [],
            staleFields: [],
            version: "settings-v3",
          },
        })
      );
    render(withRecord(<TenantAppsPage />));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await settle();
    }

    const first = document.querySelector("form");
    if (first === null) throw new Error(SETTINGS_FORM_MISSING);
    await act(async () => {
      first.requestSubmit();
      await Promise.resolve();
    });
    await settle();

    const second = document.querySelector("form");
    if (second === null) throw new Error("Settings form missing after save");
    await act(async () => {
      second.requestSubmit();
      await Promise.resolve();
    });

    const puts = fetchMock.mock.calls.filter(
      (call) => call[1]?.method === "PUT"
    );
    expect(puts).toHaveLength(2);
    expect(requestJsonBody(puts[1]?.[1])).toMatchObject({
      expectedVersion: "settings-v2",
    });
  });
});

describe("App settings editor", () => {
  it("renders the app-declared schema and stale fields", () => {
    const html = renderToString(
      <AppSettingsEditor
        orgId={ORG_ID}
        settings={{
          ...SETTINGS,
          staleFields: [
            { name: LEGACY_FIELD, reason: UNKNOWN_SETTING },
            {
              name: "defaultLocale",
              reason: "Stored value is not a BCP47 tag.",
            },
          ],
        }}
        onSaved={() => undefined}
        onReload={() => undefined}
      />
    );
    expect(html).toContain("Custom domains");
    expect(html).toContain("Default locale");
    expect(html).toContain(LEGACY_FIELD);
    expect(html).toContain(UNKNOWN_SETTING);
    expect(html).toContain("Stored value is not a BCP47 tag.");
    expect(html).toContain('aria-invalid="true"');
  });

});

describe("App settings editor mutations", () => {
  it("sends validated values with expectedVersion and idempotency", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data: {
          appId: APP_ID,
          values: { customDomainEnabled: true, defaultLocale: "en-GB" },
          removedFields: [LEGACY_FIELD],
          staleFields: [],
          version: "2026-11-07T11:00:00.000000Z",
        },
      })
    );
    const onSaved = vi.fn();
    render(
      <AppSettingsEditor
        orgId={ORG_ID}
        settings={SETTINGS}
        onSaved={onSaved}
        onReload={() => undefined}
      />
    );
    const input = document.querySelector(TEXT_INPUT);
    const form = document.querySelector("form");
    if (!(input instanceof HTMLInputElement) || form === null) {
      throw new Error(SETTINGS_FORM_MISSING);
    }
    act(() => setInputValue(input, "en-GB"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });

    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The API was not called");
    expect(requestUrl(call[0])).toBe(
      `${ORG_PATH}/apps/${APP_ID}/settings`
    );
    expect(call[1]?.method).toBe("PUT");
    expect(new Headers(call[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(
      /^[0-9a-f-]{36}$/
    );
    expect(requestJsonBody(call[1])).toEqual({
      values: { customDomainEnabled: true, defaultLocale: "en-GB" },
      expectedVersion: SETTINGS.version,
    });
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({
        version: "2026-11-07T11:00:00.000000Z",
        removedFields: [LEGACY_FIELD],
      })
    );
    expect(document.body.textContent).toContain(LEGACY_FIELD);
  });

});

describe("App settings validation errors", () => {
  it("catches a schema format error before calling the API", async () => {
    const onSaved = vi.fn();
    render(
      <AppSettingsEditor
        orgId={ORG_ID}
        settings={SETTINGS}
        onSaved={onSaved}
        onReload={() => undefined}
      />
    );
    const input = document.querySelector(TEXT_INPUT);
    const form = document.querySelector("form");
    if (!(input instanceof HTMLInputElement) || form === null) {
      throw new Error(SETTINGS_FORM_MISSING);
    }
    act(() => setInputValue(input, "not a locale"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "Use a BCP47 language tag such as en or en-IN."
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

});

describe("App settings server validation", () => {
  it("maps server SETTINGS_INVALID details when the schemas differ", async () => {
    const serverSettings: AppSettingsView = {
      ...SETTINGS,
      schema: {
        fields: [
          ...SETTINGS.schema.fields,
          {
            key: LEGACY_FIELD,
            label: "Legacy setting",
            description: "A field removed from the compiled schema.",
            required: false,
            scope: "tenant",
            defaultValue: "",
            kind: "text",
            minLength: 0,
            maxLength: 10,
            format: null,
          },
        ],
      },
      values: { ...SETTINGS.values, [LEGACY_FIELD]: "true" },
    };
    fetchMock.mockResolvedValueOnce(
      reply(422, {
        type: "/errors/settings-invalid",
        title: "Validation Failed",
        status: 422,
        detail: "Application settings failed validation.",
        code: "SETTINGS_INVALID",
        invalidParams: [{ name: LEGACY_FIELD, reason: UNKNOWN_SETTING }],
      })
    );
    const onSaved = vi.fn();
    render(
      <AppSettingsEditor
        orgId={ORG_ID}
        settings={serverSettings}
        onSaved={onSaved}
        onReload={() => undefined}
      />
    );
    const form = document.querySelector("form");
    if (form === null) throw new Error(SETTINGS_FORM_MISSING);
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(UNKNOWN_SETTING);
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("App settings editor conflicts", () => {
  it("surfaces a 409 conflict with a reload action", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(409, {
        type: "/errors/version-conflict",
        title: "Resource Conflict",
        status: 409,
        detail: "The application settings changed since they were observed.",
        code: "VERSION_CONFLICT",
      })
    );
    const onReload = vi.fn();
    render(
      <AppSettingsEditor
        orgId={ORG_ID}
        settings={SETTINGS}
        onSaved={() => undefined}
        onReload={onReload}
      />
    );
    const form = document.querySelector("form");
    if (form === null) throw new Error(SETTINGS_FORM_MISSING);
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Reload settings");
  });
});

describe("Settings schema helpers", () => {
  it("builds the form and payload from the declared schema", () => {
    expect(buildSettingsFormFields(SETTINGS.schema.fields).map((field) => field.type)).toEqual([
      "checkbox",
      "text",
    ]);
    expect(
      buildSettingsPayload(SETTINGS.schema.fields, {
        customDomainEnabled: "false",
        defaultLocale: " en-IN ",
      })
    ).toEqual({ customDomainEnabled: false, defaultLocale: "en-IN" });
    expect(
      validateSettingsForm(APP_ID, SETTINGS.schema.fields, {
        customDomainEnabled: "true",
        defaultLocale: "",
      })
    ).toEqual({});
    expect(
      mapInvalidParams<{ defaultLocale: string }>(["defaultLocale"], [
        { name: "defaultLocale", reason: "Invalid." },
      ])
    ).toEqual({ defaultLocale: "Invalid." });
  });
});

describe("Tenant quotas states", () => {
  it("renders the loading state before quotas arrive", () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code];
    expect(renderToString(<TenantQuotasPage />)).toContain("Loading quotas");
  });

  it("renders the empty state and the RFC 7807 error detail", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code];
    fetchMock.mockResolvedValueOnce(reply(200, { data: { items: [] } }));
    render(<TenantQuotasPage />);
    await settle();
    expect(document.body.textContent).toContain("No quotas configured");
  });

  it("renders the RFC 7807 quota error detail", async () => {
    authState.capabilities = [PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code];
    fetchMock.mockResolvedValueOnce(
      reply(429, {
        type: "/errors/rate-limited",
        title: "Too Many Requests",
        status: 429,
        detail: "The quota read budget is exhausted.",
        code: "RATE_LIMITED",
      })
    );
    render(<TenantQuotasPage />);
    await settle();
    expect(document.body.textContent).toContain(
      "The quota read budget is exhausted."
    );
    expect(document.body.textContent).toContain("RATE_LIMITED");
  });

});

describe("Quota table presentation", () => {
  it("renders the contracted columns with plain-text status", () => {
    const html = renderToString(
      <ConfigTable
        config={QUOTA_TABLE_CONFIG}
        rows={[
          { ...QUOTA, isOverLimit: true, currentValue: "9" },
          {
            ...QUOTA,
            resourceKey: "media.storage",
            unit: "bytes",
            currentValue: null,
            isMeasurable: false,
            isEnforced: false,
          },
        ]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.resourceKey}
        rowLabel={(row) => row.resourceKey}
      />
    );
    expect(html).toContain("Resource");
    expect(html).toContain("Limit");
    expect(html).toContain("Enforced");
    expect(html).toContain("Status");
    expect(html).toContain("Updated");
    expect(html).toContain("Over limit");
    expect(html).toContain("text-danger");
    expect(html).toContain("bytes");
    expect(html).not.toContain("Current");
    expect(html).not.toContain("Measured");
  });
});

describe("Quota form validation", () => {
  it("validates decimal limits and refuses to enforce an unmeasured resource", () => {
    expect(
      validateQuotaForm({
        resourceKey: BRANCHES_KEY,
        limitValue: "1.5",
        isEnforced: "true",
      }).limitValue
    ).toBeDefined();
    expect(
      validateQuotaForm({
        resourceKey: "media.storage",
        limitValue: "10",
        isEnforced: "true",
      }).isEnforced
    ).toBeDefined();
    expect(
      buildQuotaItem(
        { resourceKey: MEMBERS_KEY, limitValue: " 3 ", isEnforced: "false" },
        null
      )
    ).toEqual({
      resourceKey: MEMBERS_KEY,
      limitValue: "3",
      isEnforced: false,
      expectedVersion: null,
    });
  });

});

describe("Quota editor mutations", () => {
  it("sends the observed item version with an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: { items: [QUOTA] } }));
    const onSaved = vi.fn();
    render(
      <QuotaEditorModal
        orgId={ORG_ID}
        quota={QUOTA}
        availableResources={[MEMBERS_KEY]}
        onClose={() => undefined}
        onSaved={onSaved}
      />
    );
    const input = document.querySelector(TEXT_INPUT);
    const form = document.querySelector("form");
    if (!(input instanceof HTMLInputElement) || form === null) {
      throw new Error(QUOTA_FORM_MISSING);
    }
    act(() => setInputValue(input, "7"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });

    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The API was not called");
    expect(requestUrl(call[0])).toBe(`${ORG_PATH}/quotas`);
    expect(call[1]?.method).toBe("PUT");
    expect(new Headers(call[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(
      /^[0-9a-f-]{36}$/
    );
    expect(requestJsonBody(call[1])).toEqual({
      items: [
        {
          resourceKey: BRANCHES_KEY,
          limitValue: "7",
          isEnforced: true,
          expectedVersion: QUOTA.version,
        },
      ],
    });
    expect(onSaved).toHaveBeenCalledWith([QUOTA]);
  });

});

describe("Quota creation", () => {
  it("sends a null expectedVersion when creating a quota", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data: {
          items: [
            {
              ...QUOTA,
              resourceKey: MEMBERS_KEY,
              limitValue: "3",
              currentValue: "0",
              version: "2026-11-07T12:00:00.000000Z",
            },
          ],
        },
      })
    );
    render(
      <QuotaEditorModal
        orgId={ORG_ID}
        quota={null}
        availableResources={[MEMBERS_KEY]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />
    );
    const input = document.querySelector(TEXT_INPUT);
    const form = document.querySelector("form");
    if (!(input instanceof HTMLInputElement) || form === null) {
      throw new Error(QUOTA_FORM_MISSING);
    }
    act(() => setInputValue(input, "3"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(requestJsonBody(fetchMock.mock.calls[0]?.[1])).toEqual({
      items: [
        {
          resourceKey: MEMBERS_KEY,
          limitValue: "3",
          isEnforced: false,
          expectedVersion: null,
        },
      ],
    });
  });

});

describe("Quota validation errors", () => {
  it("maps server-side invalidParams onto the limit field", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(422, {
        type: "/errors/validation-failed",
        title: "Validation Failed",
        status: 422,
        detail: "A quota cannot be enforced when its consumption is not measured.",
        code: "VALIDATION_FAILED",
        invalidParams: [
          {
            name: "items.0.isEnforced",
            reason: "Storage cannot be enforced because consumption is not measured.",
          },
        ],
      })
    );
    render(
      <QuotaEditorModal
        orgId={ORG_ID}
        quota={QUOTA}
        availableResources={[MEMBERS_KEY]}
        onClose={() => undefined}
        onSaved={() => undefined}
      />
    );
    const form = document.querySelector("form");
    if (form === null) throw new Error(QUOTA_FORM_MISSING);
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "Storage cannot be enforced because consumption is not measured."
    );
  });
});

describe("Quota conflicts", () => {
  it("surfaces a 409 quota conflict without applying the change", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(409, {
        type: "/errors/quota-conflict",
        title: "Resource Conflict",
        status: 409,
        detail: "The quota changed since it was observed.",
        code: "QUOTA_CONFLICT",
      })
    );
    const onSaved = vi.fn();
    render(
      <QuotaEditorModal
        orgId={ORG_ID}
        quota={QUOTA}
        availableResources={[MEMBERS_KEY]}
        onClose={() => undefined}
        onSaved={onSaved}
      />
    );
    const form = document.querySelector("form");
    if (form === null) throw new Error(QUOTA_FORM_MISSING);
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(
      "The quota changed since it was observed."
    );
    expect(onSaved).not.toHaveBeenCalled();
  });
});