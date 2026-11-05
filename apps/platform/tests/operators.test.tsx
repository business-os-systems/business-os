// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES, PLATFORM_CAPABILITY_CODES } from "@suite/core";
import { ConfigTable } from "../src/components/tables/config-table";
import { OPERATOR_TABLE_CONFIG } from "../src/components/tables/operator-table.config";
import { createOperatorSessionTableConfig } from "../src/components/tables/operator-session-table.config";
import { OperatorCapabilityDenied } from "../src/components/operators/operator-denied";
import { ConfigFormRenderer } from "../src/components/forms/config-form-renderer";
import {
  CAPABILITY_FORM_FIELDS,
  capabilityFormValues,
  planCapabilityChange,
  selectedCapabilities,
  unknownCapabilities,
} from "../src/components/forms/capability-form.config";
import {
  OPERATOR_REASON_MIN_MESSAGE,
  availableOperatorStatusActions,
  buildOperatorStatusBody,
  canEditCapabilities,
  canEditOperatorCapabilities,
  validateOperatorStatusForm,
} from "../src/components/forms/operator-status.config";
import { OperatorStatusModal } from "../src/components/forms/operator-status-modal";
import OperatorsPage from "../src/app/(platform)/operators/page";
import OperatorRecordPage from "../src/app/(platform)/operators/[operatorId]/page";
import { OperatorCapabilitiesPanel } from "../src/app/(platform)/operators/[operatorId]/operator-capabilities-panel";
import { OperatorSessionsPanel } from "../src/app/(platform)/operators/[operatorId]/operator-sessions-panel";
import { PlatformShell } from "../src/components/layout/platform-shell";
import { canAccessPath, visibleNavigation } from "../src/components/layout/navigation.config";
import { IDEMPOTENCY_HEADER } from "../src/lib/api";
import {
  canManageOperators,
  changeOperatorCapabilities,
  revokeOperatorSession,
  type OperatorSession,
  type OperatorSummary,
} from "../src/lib/operators-api";

vi.mock("next/navigation", () => ({
  usePathname: () => "/operators",
  useRouter: () => ({ push: () => undefined, replace: () => undefined, refresh: () => undefined }),
  useParams: () => ({ operatorId: "op_1" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("../src/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: {
      operator: { id: "op_self", email: "owner@example.com", displayName: "Owner" },
      capabilities: [],
    },
    loading: false,
    error: null,
    signOutFailed: false,
    refresh: () => Promise.resolve(),
    signOut: () => Promise.resolve(),
    forceSignOut: () => undefined,
  }),
}));

const OPERATOR: OperatorSummary = {
  id: "op_1",
  email: "ops@example.com",
  displayName: "Ops Lead",
  status: "ACTIVE",
  mfaEnrolled: true,
  lastSeenAt: null,
  capabilities: [PLATFORM_CAPABILITIES.TENANTS_READ.code],
};

const SESSION_ISSUED_AT = "2026-11-05T08:00:00.000Z";

const SESSION: OperatorSession = {
  id: "sess_1",
  issuedAt: SESSION_ISSUED_AT,
  expiresAt: "2026-11-06T08:00:00.000Z",
  idleExpiresAt: "2026-11-05T09:00:00.000Z",
  revokedAt: null,
};

const MANAGER: OperatorSummary = {
  ...OPERATOR,
  capabilities: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code],
};

const MANAGE_OPERATORS_LABEL = "Manage operators";

const LAST_OPERATOR_GUARD = {
  type: "/errors/last-operator-guard",
  title: "Conflict",
  status: 409,
  detail: "The last operator able to manage operators cannot be revoked.",
  code: "LAST_OPERATOR_GUARD",
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestJsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") throw new Error("Expected a JSON request body");
  return JSON.parse(init.body);
}

function render(ui: React.ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}

function setValue(element: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
    ?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function capabilityForm(): HTMLFormElement {
  const form = document.querySelector("form");
  if (form === null) throw new Error("Capability form missing");
  return form;
}

function CapabilityPanelHarness() {
  const [operator, setOperator] = React.useState(OPERATOR);
  return (
    <OperatorCapabilitiesPanel
      operator={operator}
      onApplied={(next) => setOperator(next)}
    />
  );
}

function capabilityCheckbox(label: string): HTMLInputElement {
  const labelElement = Array.from(document.querySelectorAll("label")).find(
    (item) => item.textContent.trim() === label,
  );
  const id = labelElement?.getAttribute("for");
  const input = id === null || id === undefined ? null : document.getElementById(id);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Missing capability checkbox: ${label}`);
  }
  return input;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Operator capability gate", () => {
  it("fails closed without the operators capability", () => {
    expect(canManageOperators(undefined)).toBe(false);
    expect(canManageOperators(null)).toBe(false);
    expect(canManageOperators([PLATFORM_CAPABILITIES.TENANTS_READ.code])).toBe(false);
    expect(canManageOperators([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code])).toBe(true);
  });

  it("hides the destination without the operators capability", () => {
    expect(
      visibleNavigation([PLATFORM_CAPABILITIES.TENANTS_READ.code]).map((item) => item.id),
    ).not.toContain("operators");
    expect(
      visibleNavigation([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code]).map((item) => item.id),
    ).toContain("operators");
  });

  it("denies a direct visit instead of rendering the page", () => {
    expect(canAccessPath([], "/operators")).toBe(false);
    expect(canAccessPath([], "/operators/op_1")).toBe(false);
    expect(canAccessPath([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code], "/operators/op_1")).toBe(true);
    const shell = renderToString(
      <PlatformShell>
        <h1>Operator records</h1>
      </PlatformShell>,
    );
    expect(shell).toContain("Access denied");
    expect(shell).not.toContain("Operator records");
    expect(renderToString(<OperatorCapabilityDenied />)).toContain("Capability denied");
  });

  it("denies both operator route components at the page guard", () => {
    expect(renderToString(<OperatorsPage />)).toContain("Capability denied");
    expect(renderToString(<OperatorRecordPage />)).toContain("Capability denied");
  });
});

describe("Operator status transitions", () => {
  it("offers only the transitions the API accepts", () => {
    expect(availableOperatorStatusActions("INVITED")).toEqual(["revoke"]);
    expect(availableOperatorStatusActions("ACTIVE")).toEqual(["suspend", "revoke"]);
    expect(availableOperatorStatusActions("SUSPENDED")).toEqual(["restore", "revoke"]);
    expect(availableOperatorStatusActions("REVOKED")).toEqual([]);
  });

  it("validates the reason", () => {
    expect(validateOperatorStatusForm({ reason: "bad" }).reason).toBe(OPERATOR_REASON_MIN_MESSAGE);
    expect(validateOperatorStatusForm({ reason: "Repeated incident" })).toEqual({});
  });

  it("builds the expected-status body", () => {
    expect(
      buildOperatorStatusBody({
        action: "suspend",
        values: { reason: "  Repeated incident " },
        expectedStatus: "ACTIVE",
      }),
    ).toEqual({
      status: "SUSPENDED",
      expectedStatus: "ACTIVE",
      reason: "Repeated incident",
    });
  });
});

describe("Capability editor registry", () => {
  it("renders only registry capabilities", () => {
    expect(CAPABILITY_FORM_FIELDS.map((field) => field.name)).toEqual([...PLATFORM_CAPABILITY_CODES]);
    const html = renderToString(
      <ConfigFormRenderer
        fields={CAPABILITY_FORM_FIELDS}
        values={capabilityFormValues([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code])}
        errors={{}}
        disabled={false}
        formId="capabilities"
        onChange={() => undefined}
      />,
    );
    expect(html).toContain(MANAGE_OPERATORS_LABEL);
    expect(html).not.toContain("legacy:read");
  });

  it("ignores unregistered capabilities", () => {
    const unknown = "legacy:read";
    const values = capabilityFormValues([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code, unknown]);
    expect(selectedCapabilities(values)).toEqual([PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code]);
    expect(unknownCapabilities([unknown])).toEqual([unknown]);
    expect(
      planCapabilityChange(
        [PLATFORM_CAPABILITIES.TENANTS_READ.code, unknown],
        [PLATFORM_CAPABILITIES.AUDIT_READ.code],
      ),
    ).toEqual({
      grant: [PLATFORM_CAPABILITIES.AUDIT_READ.code],
      revoke: [PLATFORM_CAPABILITIES.TENANTS_READ.code],
    });
  });

  it("applies terminality and separation of duties to capability edits", () => {
    expect(canEditCapabilities("REVOKED")).toBe(false);
    expect(canEditCapabilities("SUSPENDED")).toBe(true);
    expect(canEditCapabilities("ACTIVE")).toBe(true);
    expect(canEditOperatorCapabilities("ACTIVE", true)).toBe(false);
    expect(canEditOperatorCapabilities("ACTIVE", false)).toBe(true);
    expect(canEditOperatorCapabilities("REVOKED", false)).toBe(false);
  });
});

describe("Operator tables", () => {
  it("renders status, sign-in and capability provenance", () => {
    const html = renderToString(
      <ConfigTable
        config={OPERATOR_TABLE_CONFIG}
        rows={[OPERATOR]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.displayName}
      />,
    );
    expect(html).toContain("Ops Lead");
    expect(html).toContain("Active");
    expect(html).toContain("text-success");
    expect(html).toContain("Passkey");
    expect(html).toContain("Never");
    expect(
      renderToString(
        <ConfigTable
          config={OPERATOR_TABLE_CONFIG}
          rows={[{
            ...OPERATOR,
            capabilities: [
              PLATFORM_CAPABILITIES.TENANTS_READ.code,
              "legacy:read",
            ],
          }]}
          state={{ kind: "ready" }}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.displayName}
        />,
      ),
    ).toContain("1 granted + 1 unregistered");
  });

  it("renders a genuine empty state", () => {
    expect(
      renderToString(
        <ConfigTable
          config={OPERATOR_TABLE_CONFIG}
          rows={[]}
          state={{ kind: "ready" }}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.displayName}
        />,
      ),
    ).toContain("No operators yet");
  });

});

describe("Operator table keyboard accessibility", () => {
  it("gives the first cell a keyboard-activatable control", () => {
    const html = renderToString(
      <ConfigTable
        config={OPERATOR_TABLE_CONFIG}
        rows={[OPERATOR]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.displayName}
        onRowClick={() => undefined}
      />,
    );
    expect(html).toContain("<button");
    expect(html).toContain("Open ");
  });
});

describe("Operator session table", () => {
  it("marks a non-revoked session revocable and a revoked one terminal", () => {
    const config = createOperatorSessionTableConfig({
      onRevoke: () => undefined,
    });
    const open = renderToString(
      <ConfigTable
        config={config}
        rows={[SESSION]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.id}
      />,
    );
    expect(open).toContain("Not revoked");
    expect(open).toContain("Revoke");
    const revoked = renderToString(
      <ConfigTable
        config={config}
        rows={[{ ...SESSION, revokedAt: "2026-11-05T08:20:00.000Z" }]}
        state={{ kind: "ready" }}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.id}
      />,
    );
    expect(revoked).toContain("Revoked");
    expect(revoked).not.toContain("Revoke</button>");
  });
});

describe("Operator status mutation", () => {
  it("submits a status change through PATCH with an idempotency key", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { data: { ...OPERATOR, status: "SUSPENDED" } }));
    const onApplied = vi.fn();
    render(
      <OperatorStatusModal
        operator={OPERATOR}
        action="suspend"
        onClose={() => undefined}
        onApplied={onApplied}
      />,
    );
    const reason = document.querySelector("textarea");
    const form = document.querySelector("form");
    if (reason === null || form === null) throw new Error("Status form missing");
    act(() => setValue(reason, "Repeated security incident"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The API was not called");
    expect(requestUrl(call[0])).toBe("http://api.test/api/v1/admin/operators/op_1");
    expect(call[1]?.method).toBe("PATCH");
    expect(new Headers(call[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestJsonBody(call[1])).toEqual({
      status: "SUSPENDED",
      expectedStatus: "ACTIVE",
      reason: "Repeated security incident",
    });
    expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({ status: "SUSPENDED" }));
  });

  it("shows the last-operator guard and does not apply the change", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, LAST_OPERATOR_GUARD));
    const onApplied = vi.fn();
    render(
      <OperatorStatusModal
        operator={OPERATOR}
        action="revoke"
        onClose={() => undefined}
        onApplied={onApplied}
      />,
    );
    const reason = document.querySelector("textarea");
    const form = document.querySelector("form");
    if (reason === null || form === null) throw new Error("Status form missing");
    act(() => setValue(reason, "Offboarding the last manager"));
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(LAST_OPERATOR_GUARD.detail);
    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe("Operator existing mutation routes", () => {
  it("uses the existing capability and session routes", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, { data: { capabilities: [PLATFORM_CAPABILITIES.AUDIT_READ.code] } }),
    );
    const capabilities = await changeOperatorCapabilities({
      operatorId: "op_1",
      grant: [PLATFORM_CAPABILITIES.AUDIT_READ.code],
      revoke: [],
      idempotencyKey: "key-1",
    });
    expect(capabilities).toEqual([PLATFORM_CAPABILITIES.AUDIT_READ.code]);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await revokeOperatorSession({ operatorId: "op_1", sessionId: "sess_1", idempotencyKey: "key-2" });
    const capabilityCall = fetchMock.mock.calls[0];
    const sessionCall = fetchMock.mock.calls[1];
    if (capabilityCall === undefined || sessionCall === undefined) throw new Error("Missing mutation");
    expect(requestUrl(capabilityCall[0])).toBe("http://api.test/api/v1/admin/operators/op_1/capabilities");
    expect(sessionCall[1]?.method).toBe("DELETE");
    expect(requestUrl(sessionCall[0])).toBe("http://api.test/api/v1/admin/operators/op_1/sessions/sess_1");
  });
});

describe("Capability editor mutation", () => {
  it("grants a registry capability through PATCH", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data: {
          capabilities: [
            PLATFORM_CAPABILITIES.TENANTS_READ.code,
            PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
          ],
        },
      }),
    );
    const onApplied = vi.fn();
    render(<OperatorCapabilitiesPanel operator={OPERATOR} onApplied={onApplied} />);
    const manage = capabilityCheckbox(MANAGE_OPERATORS_LABEL);
    act(() => manage.click());
    const form = capabilityForm();
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    const call = fetchMock.mock.calls[0];
    if (call === undefined) throw new Error("The API was not called");
    expect(requestUrl(call[0])).toBe(
      "http://api.test/api/v1/admin/operators/op_1/capabilities",
    );
    expect(call[1]?.method).toBe("PATCH");
    expect(new Headers(call[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(requestJsonBody(call[1])).toEqual({
      grant: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code],
      revoke: [],
    });
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilities: [
          PLATFORM_CAPABILITIES.TENANTS_READ.code,
          PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
        ],
      }),
      "Capabilities updated.",
    );
  });
});

describe("Capability editor idempotency", () => {
  it("uses a fresh key after a successful save", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data: {
          capabilities: [
            PLATFORM_CAPABILITIES.TENANTS_READ.code,
            PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code,
          ],
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data: { capabilities: [PLATFORM_CAPABILITIES.OPERATORS_MANAGE.code] },
      }),
    );
    render(<CapabilityPanelHarness />);
    act(() => capabilityCheckbox(MANAGE_OPERATORS_LABEL).click());
    let form = capabilityForm();
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    act(() => capabilityCheckbox("Read tenants").click());
    form = capabilityForm();
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    const first = fetchMock.mock.calls[0];
    const second = fetchMock.mock.calls[1];
    if (first === undefined || second === undefined) {
      throw new Error("Expected two capability saves");
    }
    expect(new Headers(first[1]?.headers).get(IDEMPOTENCY_HEADER)).not.toBe(
      new Headers(second[1]?.headers).get(IDEMPOTENCY_HEADER),
    );
    expect(requestJsonBody(second[1])).toEqual({
      grant: [],
      revoke: [PLATFORM_CAPABILITIES.TENANTS_READ.code],
    });
  });
});

describe("Capability editor guard", () => {
  it("shows the last-operator guard when revoking the last manager capability", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, LAST_OPERATOR_GUARD));
    const onApplied = vi.fn();
    render(<OperatorCapabilitiesPanel operator={MANAGER} onApplied={onApplied} />);
    const manage = capabilityCheckbox(MANAGE_OPERATORS_LABEL);
    act(() => manage.click());
    const form = capabilityForm();
    await act(async () => {
      form.requestSubmit();
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain(LAST_OPERATOR_GUARD.detail);
    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe("Session panel", () => {
  it("revokes through DELETE and reloads the authoritative state", async () => {
    let getCount = 0;
    fetchMock.mockImplementation((input, init) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      getCount += 1;
      const session = getCount === 1
        ? SESSION
        : { ...SESSION, revokedAt: "2026-11-05T08:20:00.000Z" };
      return Promise.resolve(
        reply(200, { data: { items: [session], nextCursor: null } }),
      );
    });
    render(<OperatorSessionsPanel operatorId="op_1" />);
    await act(async () => {
      await Promise.resolve();
    });
    const revoke = Array.from(document.querySelectorAll("button")).find(
      (item) => item.textContent.trim() === "Revoke",
    );
    if (revoke === undefined) throw new Error("Revoke button missing");
    act(() => revoke.click());
    await act(async () => {
      await Promise.resolve();
    });
    const deleteCall = fetchMock.mock.calls.find(
      (call) => call[1]?.method === "DELETE",
    );
    if (deleteCall === undefined) throw new Error("The delete was not sent");
    expect(requestUrl(deleteCall[0])).toBe(
      "http://api.test/api/v1/admin/operators/op_1/sessions/sess_1",
    );
    expect(new Headers(deleteCall[1]?.headers).get(IDEMPOTENCY_HEADER)).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(document.body.textContent).toContain("Revoked");
    expect(getCount).toBe(2);
  });
});
