// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PII_REASON_HEADER, PLATFORM_CAPABILITIES } from "@suite/core";
import AuditPage from "../src/app/(platform)/audit/page";
import { AUDIT_EXPORT_DENIED_REASON } from "../src/app/(platform)/audit/audit-export-action";
import { toAuditFilters } from "../src/components/audit/audit-filter.config";
import {
  AUDIT_EMPTY_STATE,
  createAuditTableConfig,
} from "../src/components/audit/audit-table.config";
import { ChainVerifyPanel } from "../src/components/audit/chain-verify-panel";
import { ConfigTable } from "../src/components/tables/config-table";
import type { AuditRecord } from "../src/lib/audit-api";

const authState = vi.hoisted(() => ({ capabilities: [] as string[] }));

vi.mock("../src/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: {
      operator: {
        id: "op_self",
        email: "owner@example.com",
        displayName: "Owner",
      },
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

const AUDIT_READ = PLATFORM_CAPABILITIES.AUDIT_READ.code;
const PII_READ = PLATFORM_CAPABILITIES.PII_READ.code;
const EXPORT_LABEL = "Export CSV";
const VERIFY_LABEL = "Verify chain";
const VALID_REASON = "Investigating incident #42";
const VERIFY_DETAIL = "Audit verification is rate limited. Try again in a minute.";
const SHORT_REASON_MESSAGE = "Provide a reason of at least 5 characters.";

const AUDIT_RECORD: AuditRecord = {
  id: "audit_1",
  occurredAt: "2026-11-09T06:30:00.000Z",
  actorOperatorId: "op_actor",
  action: "TENANT_UPDATED",
  entityType: "organization",
  entityId: "org_1",
  organizationId: "org_1",
  requestId: "req_abcdef123456",
  before: { note: "before-marker" },
  after: { note: "after-marker" },
  recordHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let createObjectUrl: ReturnType<typeof vi.fn>;
let anchorClick: ReturnType<typeof vi.spyOn>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type":
        status >= 400 ? "application/problem+json" : "application/json",
    },
  });
}

function envelope(data: unknown): unknown {
  return { data };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function render(ui: React.ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find(
    (item) => item.textContent.trim() === label,
  );
  if (button === undefined) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

function setInputValue(element: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")
    ?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function setTextAreaValue(element: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
    ?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function exportForm(): HTMLFormElement {
  const form = document.querySelector("form[id]");
  if (!(form instanceof HTMLFormElement)) {
    throw new Error("Export form missing");
  }
  return form;
}

function exportTextArea(): HTMLTextAreaElement {
  const textarea = document.querySelector("textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("Export reason field missing");
  }
  return textarea;
}

async function renderAuditPage(
  capabilities: readonly string[],
  items: readonly AuditRecord[] = [],
): Promise<void> {
  authState.capabilities = [...capabilities];
  fetchMock.mockResolvedValueOnce(
    reply(200, envelope({ items, nextCursor: null })),
  );
  render(<AuditPage />);
  await flush();
}

async function openExportModal(): Promise<void> {
  act(() => findButton(EXPORT_LABEL).click());
  await flush();
}

async function submitExport(reason: string): Promise<void> {
  act(() => setTextAreaValue(exportTextArea(), reason));
  const form = exportForm();
  await act(async () => {
    form.requestSubmit();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function verifyOnce(): Promise<void> {
  render(<ChainVerifyPanel />);
  act(() => findButton(VERIFY_LABEL).click());
  await flush();
}

function renderToTable(record: AuditRecord): string {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <ConfigTable
        config={createAuditTableConfig({ payloadAccess: "granted" })}
        rows={[record]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.action}
      />,
    );
  });
  return container.innerHTML;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  authState.capabilities = [];
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  createObjectUrl = vi.fn(() => "blob:audit-export");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  anchorClick = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  anchorClick.mockRestore();
  vi.unstubAllGlobals();
});

describe("Audit capability gate", () => {
  it("denies a direct visit without the audit capability and issues no request", () => {
    authState.capabilities = [];
    render(<AuditPage />);

    expect(document.body.textContent).toContain("Capability denied");
    expect(document.body.textContent).not.toContain("Audit trail");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Audit list states", () => {
  it("renders a genuine empty state", async () => {
    await renderAuditPage([AUDIT_READ]);

    expect(document.body.textContent).toContain(AUDIT_EMPTY_STATE.title);
  });

  it("shows a loading state before the first page resolves", () => {
    authState.capabilities = [AUDIT_READ];
    fetchMock.mockImplementation(
      () => new Promise<Response>(() => undefined),
    );
    render(<AuditPage />);

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain(AUDIT_EMPTY_STATE.title);
  });

  it("renders the RFC 7807 detail when the search fails", async () => {
    authState.capabilities = [AUDIT_READ];
    fetchMock.mockResolvedValueOnce(
      reply(403, {
        type: "/errors/capability-denied",
        title: "Forbidden",
        status: 403,
        detail: "The audit capability is required.",
      }),
    );
    render(<AuditPage />);
    await flush();

    expect(document.body.textContent).toContain("Unable to load audit events");
    expect(document.body.textContent).toContain(
      "The audit capability is required.",
    );
  });
});

describe("Audit filters", () => {
  it("sends the applied filters on the search request", async () => {
    authState.capabilities = [AUDIT_READ];
    fetchMock.mockResolvedValue(
      reply(200, envelope({ items: [], nextCursor: null })),
    );
    render(<AuditPage />);
    await flush();

    const organization = document.getElementById(
      "audit-filter-organizationId",
    );
    if (!(organization instanceof HTMLInputElement)) {
      throw new Error("Organization filter missing");
    }
    act(() => setInputValue(organization, "org_1"));
    const toolbar = document.querySelector("form");
    if (!(toolbar instanceof HTMLFormElement)) {
      throw new Error("Toolbar form missing");
    }
    await act(async () => {
      toolbar.requestSubmit();
      await Promise.resolve();
      await Promise.resolve();
    });

    const lastCall = fetchMock.mock.calls.at(-1);
    if (lastCall === undefined) {
      throw new Error("The search was not reissued");
    }
    expect(requestUrl(lastCall[0])).toContain("organizationId=org_1");
  });

  it("interprets the time range as UTC, not browser-local time", () => {
    expect(
      toAuditFilters({
        organizationId: "",
        actorOperatorId: "",
        action: "",
        from: "2026-11-09T10:00",
        to: "2026-11-09T12:30",
      }),
    ).toEqual({
      from: "2026-11-09T10:00:00.000Z",
      to: "2026-11-09T12:30:00.000Z",
    });
  });
});

describe("Audit table payload capability", () => {
  it("renders a populated table with restricted payloads without the PII capability", async () => {
    await renderAuditPage([AUDIT_READ], [AUDIT_RECORD]);

    expect(document.body.textContent).toContain("TENANT_UPDATED");
    expect(document.body.textContent).toContain("op_actor");
    expect(document.body.textContent).toContain("org_1");
    expect(document.body.textContent).toContain("Restricted");
    expect(document.body.textContent).not.toContain("before-marker");
    expect(document.body.textContent).not.toContain("after-marker");
  });

  it("renders the before and after payloads with the PII capability", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ], [AUDIT_RECORD]);

    expect(document.body.textContent).toContain("Before");
    expect(document.body.textContent).toContain("After");
    expect(document.body.textContent).toContain("before-marker");
    expect(document.body.textContent).toContain("after-marker");
    expect(document.body.textContent).not.toContain("Restricted");
  });

  it("renders the integrity column as neutral text, without a verification claim", () => {
    const html = renderToTable(AUDIT_RECORD);

    expect(html).toContain("Hashed");
    expect(html).not.toContain("text-success");
    expect(html).not.toContain("badge");
  });

  it("shows a genuine no-payload state for an empty before and after", () => {
    const html = renderToTable({ ...AUDIT_RECORD, before: {}, after: {} });

    expect(html).toContain("No payload");
  });
});

describe("Chain verification panel", () => {
  it("reports a verified chain only after the server answers", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        200,
        envelope({ verified: true, checkedCount: 42, firstBrokenId: null }),
      ),
    );
    render(<ChainVerifyPanel />);

    expect(document.body.textContent).toContain("Not verified yet");
    act(() => findButton(VERIFY_LABEL).click());
    await flush();

    expect(document.body.textContent).toContain("Verified");
    expect(document.body.textContent).toContain("42 events checked");
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "Verified",
    );
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("The verifier was not called");
    }
    expect(requestUrl(call[0])).toBe(
      "http://api.test/api/v1/admin/audit/verify",
    );
  });

  it("shows a loading state while the verifier runs", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    render(<ChainVerifyPanel />);
    act(() => findButton(VERIFY_LABEL).click());

    expect(document.body.textContent).toContain("Verifying...");
    expect(findButton("Verifying...").disabled).toBe(true);

    await act(async () => {
      resolveFetch(
        reply(
          200,
          envelope({ verified: true, checkedCount: 1, firstBrokenId: null }),
        ),
      );
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain("Verified");
  });
});

describe("Chain verification scopes", () => {
  it("labels the global and tenant scopes when an organization is named", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        200,
        envelope({
          verified: false,
          checkedCount: 9,
          firstBrokenId: "audit_other",
          tenant: {
            organizationId: "org_1",
            verified: true,
            checkedCount: 4,
            firstBrokenId: null,
          },
        }),
      ),
    );
    render(<ChainVerifyPanel organizationId="org_1" />);
    act(() => findButton(VERIFY_LABEL).click());
    await flush();

    expect(document.body.textContent).toContain("Global chain");
    expect(document.body.textContent).toContain("audit_other");
    expect(document.body.textContent).toContain("Tenant chain");
    expect(document.body.textContent).toContain("Scope: org_1");
    expect(document.body.textContent).toContain("4 events checked");
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("The verifier was not called");
    }
    expect(requestUrl(call[0])).toBe(
      "http://api.test/api/v1/admin/audit/verify?organizationId=org_1",
    );
  });

  it("does not present an empty tenant scope as a verification claim", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        200,
        envelope({
          verified: true,
          checkedCount: 1,
          firstBrokenId: null,
          tenant: {
            organizationId: "org_empty",
            verified: true,
            checkedCount: 0,
            firstBrokenId: null,
          },
        }),
      ),
    );
    render(<ChainVerifyPanel organizationId="org_empty" />);
    act(() => findButton(VERIFY_LABEL).click());
    await flush();

    expect(document.body.textContent).toContain(
      "No audit records in this scope, so there is nothing to verify.",
    );
  });
});

describe("Chain verification failures", () => {
  it("shows the first broken record for a broken chain", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(
        200,
        envelope({ verified: false, checkedCount: 7, firstBrokenId: "audit_7" }),
      ),
    );
    await verifyOnce();

    expect(document.body.textContent).toContain("Broken chain");
    expect(document.body.textContent).toContain("audit_7");
    expect(document.querySelector(".text-danger")).not.toBeNull();
  });

  it("shows the RFC 7807 detail when verification fails", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, {
        type: "/errors/rate-limit-exceeded",
        title: "Too many requests",
        status: 429,
        detail: VERIFY_DETAIL,
      }),
    );
    await verifyOnce();

    expect(document.body.textContent).toContain("Verification failed");
    expect(document.body.textContent).toContain(VERIFY_DETAIL);
  });
});

describe("Audit export gating", () => {
  it("disables the export without the PII capability and explains why", async () => {
    await renderAuditPage([AUDIT_READ]);

    const exportButton = findButton(EXPORT_LABEL);
    expect(exportButton.disabled).toBe(true);
    expect(document.body.textContent).toContain(AUDIT_EXPORT_DENIED_REASON);
  });

  it("rejects a reason shorter than five characters before any export request", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    await openExportModal();
    await submitExport("bad");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(SHORT_REASON_MESSAGE);
  });

  it("sends the recorded reason and downloads the CSV", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    fetchMock.mockResolvedValueOnce(
      new Response("id,action\naudit_1,TENANT_UPDATED", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );
    await openExportModal();
    await submitExport(VALID_REASON);

    const exportCall = fetchMock.mock.calls[1];
    if (exportCall === undefined) {
      throw new Error("The export was not requested");
    }
    expect(requestUrl(exportCall[0])).toBe(
      "http://api.test/api/v1/admin/audit/export",
    );
    expect(new Headers(exportCall[1]?.headers).get(PII_REASON_HEADER)).toBe(
      VALID_REASON,
    );
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
  });
});

describe("Audit export request boundary", () => {
  it("collapses the recorded reason to a single header line", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    fetchMock.mockResolvedValueOnce(
      new Response("id,action\naudit_1,TENANT_UPDATED", {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );
    await openExportModal();
    await submitExport("  Investigating\n   incident #42 ");

    const exportCall = fetchMock.mock.calls[1];
    if (exportCall === undefined) {
      throw new Error("The export was not requested");
    }
    expect(new Headers(exportCall[1]?.headers).get(PII_REASON_HEADER)).toBe(
      "Investigating incident #42",
    );
  });

  it("rejects a reason the request header cannot carry", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    await openExportModal();
    await submitExport("調査のためのエクスポート");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(
      "Use Latin letters, numbers and punctuation only.",
    );
  });

  it("refuses a 200 answer that is not a CSV file", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    fetchMock.mockResolvedValueOnce(
      new Response("<html>gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );
    await openExportModal();
    await submitExport(VALID_REASON);

    expect(document.body.textContent).toContain(
      "The audit export did not return a CSV file.",
    );
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("shows the RFC 7807 detail when the export is refused", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    fetchMock.mockResolvedValueOnce(
      reply(422, {
        type: "/errors/validation-failed",
        title: "Validation failed",
        status: 422,
        detail: "A recorded reason is required to export audit data.",
      }),
    );
    await openExportModal();
    await submitExport(VALID_REASON);

    expect(document.body.textContent).toContain(
      "A recorded reason is required to export audit data.",
    );
  });
});

describe("Audit keyboard access", () => {
  it("exposes the verify and export actions as native, focusable, activatable buttons", async () => {
    await renderAuditPage([AUDIT_READ, PII_READ]);
    fetchMock.mockResolvedValueOnce(
      reply(
        200,
        envelope({ verified: true, checkedCount: 1, firstBrokenId: null }),
      ),
    );

    const verify = findButton(VERIFY_LABEL);
    expect(verify.tagName).toBe("BUTTON");
    verify.focus();
    expect(document.activeElement).toBe(verify);
    act(() => verify.click());
    await flush();
    expect(document.body.textContent).toContain("Verified");

    const exportButton = findButton(EXPORT_LABEL);
    expect(exportButton.disabled).toBe(false);
    exportButton.focus();
    expect(document.activeElement).toBe(exportButton);
    act(() => exportButton.click());
    await flush();
    expect(document.body.textContent).toContain("Export audit CSV");
  });
});
