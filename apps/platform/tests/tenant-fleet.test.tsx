import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PLATFORM_CAPABILITIES } from "@suite/core";
import { ConfigTableRenderer } from "@suite/ui";
import type { ConfigTableState } from "../src/components/tables/config-table";
import {
  TENANT_FILTERED_EMPTY_STATE,
  TENANT_TABLE_CONFIG,
} from "../src/components/tables/tenant-table.config";
import { TenantAuditPanel } from "../src/app/(platform)/tenants/[orgId]/tenant-audit-panel";
import { TenantPiiPanel } from "../src/app/(platform)/tenants/[orgId]/tenant-pii-panel";
import {
  canReadPersonalData,
  TENANT_STATUSES,
  type TenantSummary,
} from "../src/lib/tenant-api";
import { toMessage } from "../src/lib/error-message";

const CAPABILITY_DENIED = "Capability denied.";
import { resolveFleetState } from "../src/app/(platform)/tenants/page";
import { formatDate, formatDateTime, UNAVAILABLE } from "../src/lib/format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tenants",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ orgId: "org_probe" }),
}));

const TENANT: TenantSummary = {
  id: "org_probe",
  name: "River View",
  slug: "river-view",
  status: "ACTIVE",
  createdAt: "2026-01-05T00:00:00.000Z",
  branchCount: 2,
  memberCount: 7,
  installedAppIds: ["website-builder"],
  asOf: "2026-01-05T00:00:00.000Z",
  quotas: { enforced: 2, overLimit: 0, measured: 2 },
};

const READY: ConfigTableState = { kind: "ready" };

function renderTable(
  rows: readonly TenantSummary[],
  state: ConfigTableState,
  options: { onRowClick?: (row: TenantSummary) => void } = {},
): string {
  return renderToString(
    <ConfigTableRenderer
      config={TENANT_TABLE_CONFIG}
      data={rows}
      rowKey={(row) => row.id}
      rowLabel={(row) => row.name}
      isLoading={state.kind === "loading"}
      error={state.kind === "error" ? state.message : null}
      errorTitle={state.kind === "error" ? state.title : undefined}
      onRowOpen={options.onRowClick}
    />,
  );
}

describe("Tenant fleet table", () => {
  it("exposes no personal-data column", () => {
    const headers = TENANT_TABLE_CONFIG.columns
      .map((column) => column.header.toLowerCase())
      .join(" ");
    expect(headers).not.toContain("email");
    expect(headers).not.toContain("personal");
  });

  it("renders the configured empty state instead of a blank table", () => {
    const html = renderTable([], READY);
    expect(html).toContain(TENANT_TABLE_CONFIG.emptyState.title);
    expect(html).not.toContain("<table");
  });

  it("renders the filtered-empty state when the caller overrides it", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={TENANT_TABLE_CONFIG}
        data={[]}
        rowKey={(row) => row.id}
        rowLabel={(row) => row.name}
        emptyState={TENANT_FILTERED_EMPTY_STATE}
      />,
    );
    expect(html).toContain(TENANT_FILTERED_EMPTY_STATE.title);
    expect(html).not.toContain(TENANT_TABLE_CONFIG.emptyState.title);
  });

  it("renders the error state with the caller title", () => {
    const html = renderTable([], {
      kind: "error",
      title: "Unable to load tenants",
      message: CAPABILITY_DENIED,
    });
    expect(html).toContain(CAPABILITY_DENIED);
    expect(html).not.toContain("<table");
  });

  it("renders no table while loading", () => {
    const html = renderTable([], { kind: "loading" });
    expect(html).not.toContain("<table");
    expect(html).not.toContain(TENANT_TABLE_CONFIG.emptyState.title);
  });

  it("renders a row with the tenant name, slug and status", () => {
    const html = renderTable([TENANT], READY);
    expect(html).toContain("River View");
    expect(html).toContain("river-view");
    expect(html).toContain("Active");
  });

  it("gives the first cell a keyboard-activatable control when a row opens", () => {
    const html = renderTable([TENANT], READY, { onRowClick: () => undefined });
    expect(html).toContain("<button");
    expect(html).toContain("Open ");
    expect(html).toContain("River View");
  });

  it("renders no row button when the row is not interactive", () => {
    const html = renderTable([TENANT], READY);
    expect(html).not.toContain("<button");
  });
});

describe("Tenant personal-data gate", () => {
  it("denies without a capability list", () => {
    expect(canReadPersonalData(undefined)).toBe(false);
    expect(canReadPersonalData(null)).toBe(false);
    expect(canReadPersonalData([])).toBe(false);
  });

  it("denies every capability except the personal-data one", () => {
    expect(canReadPersonalData([PLATFORM_CAPABILITIES.TENANTS_READ.code])).toBe(
      false,
    );
    expect(canReadPersonalData([PLATFORM_CAPABILITIES.AUDIT_READ.code])).toBe(
      false,
    );
  });

  it("allows the personal-data capability", () => {
    expect(canReadPersonalData([PLATFORM_CAPABILITIES.PII_READ.code])).toBe(
      true,
    );
  });

  it("renders nothing without the personal-data capability", () => {
    const html = renderToString(
      <TenantPiiPanel orgId={TENANT.id} canRead={false} />,
    );
    expect(html).toBe("");
  });

  it("offers the reveal action with the personal-data capability", () => {
    const html = renderToString(
      <TenantPiiPanel orgId={TENANT.id} canRead={true} />,
    );
    expect(html).toContain("Show personal data");
    expect(html).toContain("recorded reason");
  });

  it("withholds the lifecycle reason without the personal-data capability", () => {
    const lifecycle = [{
      id: "evt_1", fromStatus: "ACTIVE", toStatus: "SUSPENDED",
      reason: "Member email a@b.com", actorOperatorId: "op_1",
      occurredAt: "2026-11-04T00:00:00.000Z",
    }];
    const restricted = renderToString(
      <TenantAuditPanel lifecycle={lifecycle} audit={[]} lifecycleHasMore={false} canReadReason={false} />,
    );
    expect(restricted).toContain("Reason withheld");
    expect(restricted).not.toContain("Member email");
    const allowed = renderToString(
      <TenantAuditPanel lifecycle={lifecycle} audit={[]} lifecycleHasMore={false} canReadReason />,
    );
    expect(allowed).toContain("Member email");
  });
});

describe("Platform formatting helpers", () => {
  it("renders an unusable timestamp as unavailable instead of throwing", () => {
    expect(formatDateTime("not-a-date")).toBe(UNAVAILABLE);
    expect(formatDate("not-a-date")).toBe(UNAVAILABLE);
  });

  it("formats a valid timestamp", () => {
    expect(formatDate(TENANT.createdAt)).not.toBe(UNAVAILABLE);
  });

  it("never renders an object as text", () => {
    expect(toMessage({ code: "X" })).toBe("An unexpected error occurred.");
    expect(toMessage(new Error("boom"))).toBe("boom");
    expect(toMessage("plain")).toBe("plain");
  });

  it("pins the tenant status vocabulary", () => {
    expect(TENANT_STATUSES).toEqual([
      "ACTIVE",
      "TRIAL",
      "PAST_DUE",
      "SUSPENDED",
      "ARCHIVED",
    ]);
  });
});

describe("Tenant fleet state and quota summary", () => {
  it("maps loading, error and ready without consulting stale rows", () => {
    expect(resolveFleetState(true, null, 0)).toEqual({ kind: "loading" });
    expect(resolveFleetState(false, CAPABILITY_DENIED, 0)).toEqual({
      kind: "error",
      title: "Unable to load tenants",
      message: CAPABILITY_DENIED,
    });
    expect(resolveFleetState(false, null, 2)).toEqual({ kind: "ready" });
  });

  it("renders the within/over quota summary", () => {
    const html = renderToString(
      <ConfigTableRenderer
        config={TENANT_TABLE_CONFIG}
        data={[
          {
            ...TENANT,
            quotas: { enforced: 2, overLimit: 1, measured: 2 },
          },
        ]}
        rowKey={(row) => row.id}
      />,
    );
    expect(html.replace(/<!-- -->/g, "")).toContain("1/2 within");

    const none = renderToString(
      <ConfigTableRenderer
        config={TENANT_TABLE_CONFIG}
        data={[
          {
            ...TENANT,
            quotas: { enforced: 0, overLimit: 0, measured: 0 },
          },
        ]}
        rowKey={(row) => row.id}
      />,
    );
    expect(none).toContain("None");
  });
});
