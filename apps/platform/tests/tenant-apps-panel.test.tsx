// @vitest-environment jsdom
/* global HTMLElement, HTMLInputElement */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TenantEntitlement } from "../src/lib/apps-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

interface EntitlementInput {
  readonly orgId: string;
  readonly appId: string;
  readonly enabled: boolean;
  readonly expectedVersion: string;
  readonly idempotencyKey: string;
}

const api = vi.hoisted(() => ({
  fetchTenantEntitlements:
    vi.fn<() => Promise<readonly TenantEntitlement[]>>(),
  setTenantEntitlement:
    vi.fn<
      (input: EntitlementInput) => Promise<readonly TenantEntitlement[]>
    >(),
}));

vi.mock("../src/lib/apps-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/apps-api")>();
  return {
    ...actual,
    fetchTenantEntitlements: api.fetchTenantEntitlements,
    setTenantEntitlement: api.setTenantEntitlement,
  };
});

vi.mock(
  "../src/app/(platform)/tenants/[orgId]/apps/app-settings-section",
  () => ({ AppSettingsSection: () => null }),
);

const { TenantAppsPanel } = await import(
  "../src/app/(platform)/tenants/[orgId]/apps/tenant-apps-panel"
);

const enabledApp: TenantEntitlement = {
  appId: "website-builder",
  isEnabled: true,
  installedAt: "2026-01-01T00:00:00.000Z",
  version: "v1",
  branchOverrides: [],
};

const disabledApp: TenantEntitlement = {
  appId: "notifications",
  isEnabled: false,
  installedAt: "2026-01-01T00:00:00.000Z",
  version: "v1",
  branchOverrides: [],
};

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  api.fetchTenantEntitlements.mockReset();
  api.setTenantEntitlement.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function checkboxes(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('input[type="checkbox"]'));
}

async function renderPanel(canManage: boolean): Promise<void> {
  act(() => {
    root.render(
      <TenantAppsPanel
        orgId="org_1"
        apps={["website-builder", "notifications"]}
        canManage={canManage}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("tenant apps panel", () => {
  it("toggles an app with its version and an idempotency key", async () => {
    api.fetchTenantEntitlements.mockResolvedValue([enabledApp, disabledApp]);
    api.setTenantEntitlement.mockResolvedValue([
      enabledApp,
      { ...disabledApp, isEnabled: true, version: "v2" },
    ]);

    await renderPanel(true);

    expect(container.textContent).toContain("Disabled");
    const boxes = checkboxes();
    expect(boxes).toHaveLength(2);
    expect(boxes[1]?.checked).toBe(false);

    act(() => boxes[1]?.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(api.setTenantEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        appId: "notifications",
        enabled: true,
        expectedVersion: "v1",
      }),
    );
    const call = api.setTenantEntitlement.mock.calls[0]?.[0];
    expect(call?.idempotencyKey).toMatch(/^[0-9a-z-]{8,}$/);
    expect(checkboxes()[1]?.checked).toBe(true);
  });

  it("shows the RFC 7807 failure and reloads the list", async () => {
    api.fetchTenantEntitlements.mockResolvedValue([enabledApp, disabledApp]);
    api.setTenantEntitlement.mockRejectedValueOnce(
      new Error("The entitlement changed. Reload and retry."),
    );

    await renderPanel(true);
    act(() => checkboxes()[1]?.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(
      "The entitlement changed. Reload and retry.",
    );
    expect(api.fetchTenantEntitlements).toHaveBeenCalledTimes(2);
  });

  it("disables the toggles for a read-only operator", async () => {
    api.fetchTenantEntitlements.mockResolvedValue([enabledApp, disabledApp]);

    await renderPanel(false);

    for (const box of checkboxes()) {
      expect(box.disabled).toBe(true);
    }
  });
});
