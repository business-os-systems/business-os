// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { TenantOverviewPanel } from "../src/app/(platform)/tenants/[orgId]/tenant-overview-panel";
import { UNAVAILABLE, formatDateTimeInZone } from "../src/lib/format";
import type { TenantRecord } from "../src/lib/tenant-api";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const TENANT_TIME_ZONE = "America/New_York";
const UTC_RENDER = "1 Jan 2026, 00:00";
const LOCAL_RENDER = "31 Dec 2025, 19:00";
const UTC_CAPTION = "Times shown in UTC.";
const LOCAL_CAPTION = `Times shown in the tenant zone (${TENANT_TIME_ZONE}).`;
const TOGGLE_LABEL = `Show tenant local time (${TENANT_TIME_ZONE})`;

const RECORD: TenantRecord = {
  profile: {
    id: "org_1",
    name: "River View",
    slug: "river-view",
    status: "ACTIVE",
    timezone: TENANT_TIME_ZONE,
    createdAt: CREATED_AT,
  },
  counts: { asOf: CREATED_AT, branches: 1, members: 2 },
  apps: ["website-builder"],
  quotas: [],
  lifecycle: [],
  lifecycleHasMore: false,
  recentAudit: [],
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const roots: Root[] = [];

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = "";
});

describe("Tenant local time formatting", () => {
  it("renders an instant in the declared tenant zone", () => {
    expect(formatDateTimeInZone(CREATED_AT, TENANT_TIME_ZONE)).toBe(
      LOCAL_RENDER
    );
  });

  it("renders an unknown zone as unavailable instead of throwing", () => {
    expect(formatDateTimeInZone(CREATED_AT, "Mars/Olympus")).toBe(UNAVAILABLE);
  });
});

describe("Tenant overview local-time toggle", () => {
  it("starts in UTC and shows the tenant zone on request", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<TenantOverviewPanel record={RECORD} />));

    expect(container.textContent).toContain(UTC_RENDER);
    expect(container.textContent).toContain(UTC_CAPTION);

    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]'
    );
    if (toggle === null) {
      throw new Error("Local-time toggle is missing.");
    }
    expect(toggle.labels?.[0]?.textContent).toBe(TOGGLE_LABEL);
    act(() => toggle.click());

    expect(container.textContent).toContain(LOCAL_RENDER);
    expect(container.textContent).toContain(LOCAL_CAPTION);
  });

  it("renders the UTC caption on the server before any interaction", () => {
    const html = renderToString(<TenantOverviewPanel record={RECORD} />);

    expect(html).toContain(UTC_RENDER);
    expect(html).toContain(UTC_CAPTION);
    expect(html).toContain(TENANT_TIME_ZONE);
  });
});
