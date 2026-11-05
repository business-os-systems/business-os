// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES, TENANT_LIFECYCLE_ACTION } from "@suite/core";
import { IDEMPOTENCY_HEADER, setUnauthorizedHandler } from "../src/lib/api";
import { requestTenantLifecycle } from "../src/lib/tenant-api";
import {
  LIFECYCLE_ACTION_CONFIG,
  LIFECYCLE_CONFLICT_TITLE,
  LIFECYCLE_REASON_MIN_MESSAGE,
  LIFECYCLE_SLUG_MISMATCH_MESSAGE,
  availableLifecycleActions,
  buildLifecycleBody,
  canManageLifecycle,
  validateLifecycleForm,
  type LifecycleTenant,
} from "../src/components/forms/lifecycle-form.config";
import { TenantLifecycleActions } from "../src/components/forms/tenant-lifecycle-actions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const TENANT: LifecycleTenant = { id: "org_1", name: "River View", slug: "river-view", status: "ACTIVE" };
const roots: Root[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

function render(ui: ReactElement): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(ui));
}
function button(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (found === undefined) throw new Error(`Missing button ${label}`);
  return found;
}
function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element) as object, "value")?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}
function mount(overrides: Record<string, unknown> = {}): void {
  render(<TenantLifecycleActions tenant={TENANT} canManage onApplied={vi.fn()} onReload={vi.fn()} {...overrides} />);
}
function open(action: string): void {
  act(() => button(LIFECYCLE_ACTION_CONFIG[action as keyof typeof LIFECYCLE_ACTION_CONFIG].label).click());
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe("Lifecycle config", () => {
  it("fails closed and offers only allowed transitions", () => {
    expect(canManageLifecycle(undefined)).toBe(false);
    expect(canManageLifecycle([])).toBe(false);
    expect(canManageLifecycle([PLATFORM_CAPABILITIES.TENANTS_READ.code])).toBe(false);
    expect(canManageLifecycle([PLATFORM_CAPABILITIES.TENANTS_LIFECYCLE.code])).toBe(true);
    expect(availableLifecycleActions("ACTIVE")).toEqual([TENANT_LIFECYCLE_ACTION.SUSPEND, TENANT_LIFECYCLE_ACTION.ARCHIVE]);
    expect(availableLifecycleActions("SUSPENDED")).toEqual([TENANT_LIFECYCLE_ACTION.RESTORE, TENANT_LIFECYCLE_ACTION.ARCHIVE]);
    expect(availableLifecycleActions("ARCHIVED")).toEqual([]);
    expect(renderToString(<TenantLifecycleActions tenant={TENANT} canManage={false} onApplied={vi.fn()} onReload={vi.fn()} />)).toBe("");
  });

  it("validates the reason and slug through the shared schema", () => {
    const values = { reason: "Offboarding after contract end", confirmSlug: "river-view" };
    expect(validateLifecycleForm({ action: TENANT_LIFECYCLE_ACTION.ARCHIVE, values: { ...values, reason: "abc" }, slug: "river-view" }).reason).toBe(LIFECYCLE_REASON_MIN_MESSAGE);
    expect(validateLifecycleForm({ action: TENANT_LIFECYCLE_ACTION.ARCHIVE, values: { ...values, confirmSlug: "x" }, slug: "river-view" }).confirmSlug).toBe(LIFECYCLE_SLUG_MISMATCH_MESSAGE);
    expect(validateLifecycleForm({ action: TENANT_LIFECYCLE_ACTION.ARCHIVE, values, slug: "river-view" })).toEqual({});
    expect(buildLifecycleBody({ action: TENANT_LIFECYCLE_ACTION.SUSPEND, values: { reason: "  Non-payment ", confirmSlug: "" }, expectedStatus: "ACTIVE" })).toEqual({ reason: "Non-payment", expectedStatus: "ACTIVE" });
    expect(buildLifecycleBody({ action: TENANT_LIFECYCLE_ACTION.ARCHIVE, values, expectedStatus: "ACTIVE" })).toMatchObject({ confirmSlug: "river-view" });
  });
});

describe("Lifecycle modal", () => {
  it("requires the exact slug and submits by keyboard", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { success: true, requestId: "r", timestamp: "2026-11-04T00:00:00.000Z", data: { lifecycleEventId: "e", fromStatus: "ACTIVE", toStatus: "ARCHIVED", occurredAt: "2026-11-04T00:00:00.000Z" } }));
    const onApplied = vi.fn();
    mount({ onApplied });
    open(TENANT_LIFECYCLE_ACTION.ARCHIVE);

    const label = LIFECYCLE_ACTION_CONFIG.ARCHIVE.confirmLabel;
    expect(document.body.textContent).toContain("Type river-view to confirm");
    expect(button(label).disabled).toBe(true);
    const reason = document.querySelector("textarea");
    const slug = document.querySelector("input");
    if (reason === null || slug === null) throw new Error("Fields missing");
    act(() => { setValue(reason, "test"); setValue(slug, "wrong"); });
    expect(document.body.textContent).toContain(LIFECYCLE_REASON_MIN_MESSAGE);
    expect(document.body.textContent).toContain(LIFECYCLE_SLUG_MISMATCH_MESSAGE);
    act(() => { setValue(reason, "Offboarding after contract end"); setValue(slug, "river-view"); });
    expect(button(label).disabled).toBe(false);

    const form = document.querySelector("form");
    if (form === null) throw new Error("Form missing");
    await act(async () => form.requestSubmit());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/admin/tenants/org_1/archive");
    expect((init.headers as Record<string, string>)[IDEMPOTENCY_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(init.body))).toEqual({ reason: "Offboarding after contract end", expectedStatus: "ACTIVE", confirmSlug: "river-view" });
    expect(onApplied).toHaveBeenCalledWith(LIFECYCLE_ACTION_CONFIG.ARCHIVE.successMessage);
  });

  it("shows the reload notice only for LIFECYCLE_CONFLICT and never retries", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { type: "/errors/lifecycle-conflict", status: 409, code: "LIFECYCLE_CONFLICT", detail: "The tenant's status changed." }));
    const onReload = vi.fn();
    mount({ onReload });
    open(TENANT_LIFECYCLE_ACTION.SUSPEND);
    const reason = document.querySelector("textarea");
    if (reason === null) throw new Error("Reason field missing");
    act(() => setValue(reason, "Non-payment after two reminders"));
    await act(async () => button(LIFECYCLE_ACTION_CONFIG.SUSPEND.confirmLabel).click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain(LIFECYCLE_CONFLICT_TITLE);
    act(() => button("Reload record").click());
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("does not mislabel another 409 as a status change", async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { type: "/errors/idempotency-conflict", status: 409, code: "IDEMPOTENCY_CONFLICT", detail: "An identical request is already in progress." }));
    mount();
    open(TENANT_LIFECYCLE_ACTION.SUSPEND);
    const reason = document.querySelector("textarea");
    if (reason === null) throw new Error("Reason field missing");
    act(() => setValue(reason, "Non-payment after two reminders"));
    await act(async () => button(LIFECYCLE_ACTION_CONFIG.SUSPEND.confirmLabel).click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("An identical request is already in progress.");
    expect(document.body.textContent).not.toContain(LIFECYCLE_CONFLICT_TITLE);
  });

  it("maps a 401 to the shell handler", async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { type: "/errors/unauthorized", code: "AUTH_REQUIRED" }));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(requestTenantLifecycle({ orgId: "org_1", action: TENANT_LIFECYCLE_ACTION.SUSPEND, body: { reason: "Non-payment", expectedStatus: "ACTIVE" }, idempotencyKey: "key-1" })).rejects.toMatchObject({ status: 401 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
