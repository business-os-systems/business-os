// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TenantRecord } from "../src/lib/tenant-api";
import TenantRecordLayout from "../src/app/(platform)/tenants/[orgId]/layout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const fetchTenantRecord = vi.hoisted(() => vi.fn());
const navState = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/tenant-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant-api")>();
  return { ...actual, fetchTenantRecord };
});

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgId: "org_1" }),
  useRouter: () => ({ push: navState.push }),
  usePathname: () => "/tenants/org_1/overview",
}));

vi.mock("@/components/auth/auth-provider", () => ({
  usePlatformAuth: () => ({
    session: {
      operator: { id: "op_1", email: "ops@example.com", displayName: "Ops" },
      capabilities: ["platform:tenants:read"],
    },
  }),
}));

const TENANT_NAME = "River View Homestay";
const TENANT_SLUG = "river-view";

const RECORD: TenantRecord = {
  profile: {
    id: "org_1",
    name: TENANT_NAME,
    slug: TENANT_SLUG,
    status: "ACTIVE",
    timezone: "Asia/Kolkata",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  counts: { branches: 1, members: 2, asOf: "2026-11-10T00:00:00.000Z" },
  apps: [],
  quotas: [],
  lifecycle: [],
  lifecycleHasMore: false,
  recentAudit: [],
};

let container: HTMLDivElement;
let root: Root;

function renderLayout(): void {
  root.render(
    <TenantRecordLayout>
      <p>Overview panel</p>
    </TenantRecordLayout>,
  );
}

beforeEach(() => {
  fetchTenantRecord.mockReset();
  navState.push.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("Tenant record hub layout", () => {
  it("renders the loading state, then the record and its panel", async () => {
    let resolveRecord: ((record: TenantRecord) => void) | undefined;
    fetchTenantRecord.mockReturnValue(
      new Promise<TenantRecord>((resolve) => {
        resolveRecord = resolve;
      }),
    );

    await act(async () => {
      renderLayout();
      await Promise.resolve();
    });

    expect(fetchTenantRecord).toHaveBeenCalledWith("org_1");
    expect(container.textContent).not.toContain(TENANT_NAME);

    if (resolveRecord === undefined) {
      throw new Error("The record request was not started");
    }
    await act(async () => {
      resolveRecord?.(RECORD);
      await Promise.resolve();
    });

    expect(container.textContent).toContain(TENANT_NAME);
    expect(container.textContent).toContain(TENANT_SLUG);
    expect(container.textContent).toContain("Overview panel");
    expect(container.textContent).not.toContain("All tenants");
  });

  it("shows the problem and retries the read", async () => {
    fetchTenantRecord
      .mockRejectedValueOnce(new Error("Read failed"))
      .mockResolvedValueOnce(RECORD);

    await act(async () => {
      renderLayout();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Unable to load this tenant");
    expect(container.textContent).toContain("Read failed");

    const retry = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );
    if (retry === undefined) {
      throw new Error("The retry button was not rendered");
    }
    await act(async () => {
      retry.click();
      await Promise.resolve();
    });

    expect(fetchTenantRecord).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain(TENANT_NAME);
  });
});
