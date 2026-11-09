import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock(
  "../src/app/(dashboard)/settings/security/end-support-session-button",
  () => ({
    EndSupportSessionButton: ({ ticketId }: { ticketId: string }) => (
      <button type="button">End session {ticketId}</button>
    ),
  }),
);
import { SupportHistory } from "../src/app/(dashboard)/settings/security/support-history";
import {
  deriveSupportHistoryState,
  formatSupportHistoryTimestamp,
  formatSupportSessionActor,
} from "../src/app/(dashboard)/settings/security/support-history.config";
import type { SupportSessionHistoryItem } from "../src/lib/support-session-client";

const FIXED_ENDED_AT = "2026-11-09T13:12:00.000Z";

const RUNNING: SupportSessionHistoryItem = {
  ticketId: "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f",
  operatorDisplayName: "Duty Operator",
  reason: "Investigating the billing discrepancy reported in SUP-237.",
  ticketRef: "SUP-237",
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2030-01-01T00:00:00.000Z",
  endedAt: null,
  endedBy: null,
};

const TENANT_ENDED: SupportSessionHistoryItem = {
  ticketId: "1f5d3a2c-9b8e-4c7d-8a6f-2e1d0c9b8a7f",
  operatorDisplayName: "Duty Operator",
  reason: "Verifying the nightly audit rollover.",
  ticketRef: "SUP-238",
  startedAt: "2026-11-08T10:00:00.000Z",
  expiresAt: "2026-11-08T10:30:00.000Z",
  endedAt: FIXED_ENDED_AT,
  endedBy: "tenant:usr_workspace_admin",
};

const EXPIRED: SupportSessionHistoryItem = {
  ...TENANT_ENDED,
  ticketId: "2b3c4d5e-6f70-4a8b-9c0d-1e2f3a4b5c6d",
  ticketRef: "SUP-240",
  endedAt: null,
  endedBy: null,
  expiresAt: "2026-11-07T10:30:00.000Z",
};

const OPERATOR_ENDED: SupportSessionHistoryItem = {
  ...TENANT_ENDED,
  ticketId: "6a7b8c9d-0e1f-4a2b-9c3d-4e5f6a7b8c9d",
  ticketRef: "SUP-239",
  endedBy: "op_duty_operator",
};

describe("Tenant support-session history table (FR-049, CT-5)", () => {
  it("renders the recorded sessions with a plain-text status", () => {
    const html = renderToString(
      <SupportHistory
        items={[RUNNING, TENANT_ENDED, OPERATOR_ENDED]}
        nextCursor={null}
        showNewest={false}
        canEnd={false}
      />
    );

    expect(html).toContain("Duty Operator");
    expect(html).toContain("SUP-237");
    expect(html).toContain("Active");
    expect(html).toContain("Ended");
    expect(html).toContain("Tenant administrator");
    expect(html).toContain("Platform operator");
    expect(html).not.toContain("dismiss");
  });

  it("shows the empty state instead of a fabricated row", () => {
    const html = renderToString(
      <SupportHistory
        items={[]}
        nextCursor={null}
        showNewest={false}
        canEnd={false}
      />
    );

    expect(html).toContain("No support sessions recorded");
  });

  it("marks an expired, not-ended session as expired", () => {
    expect(deriveSupportHistoryState(EXPIRED, Date.parse(FIXED_ENDED_AT))).toBe(
      "expired"
    );
  });

  it("renders the actor kind and a dash for a missing timestamp", () => {
    expect(formatSupportSessionActor(null)).toBe("—");
    expect(formatSupportHistoryTimestamp(null)).toBe("—");
    expect(formatSupportHistoryTimestamp(FIXED_ENDED_AT)).toContain("UTC");
  });

});

describe("Tenant support-session history pagination and actions", () => {
  it("offers only the older-page link when the reader is already past the newest page", () => {
    const html = renderToString(
      <SupportHistory
        items={[RUNNING]}
        nextCursor="older"
        showNewest={false}
        canEnd={false}
      />
    );

    expect(html).toContain("Older sessions");
    expect(html).not.toContain("Newest sessions");
  });

  it("offers no older-page link when the cursor is exhausted", () => {
    const html = renderToString(
      <SupportHistory
        items={[RUNNING]}
        nextCursor={null}
        showNewest={false}
        canEnd={false}
      />
    );

    expect(html).not.toContain("Older sessions");
    expect(html).not.toContain("/settings/security?cursor=");
  });

  it("links to the older page with the encoded cursor and back to the newest", () => {
    const html = renderToString(
      <SupportHistory
        items={[RUNNING]}
        nextCursor="cur/+=="
        showNewest
        canEnd={false}
      />
    );

    expect(html).toContain("Older sessions");
    expect(html).toContain("/settings/security?cursor=cur%2F%2B%3D%3D");
    expect(html).toContain("Newest sessions");
  });
});

describe("Tenant support-session history actions", () => {
  it("offers the terminate control only for an active session and a permitted reader", () => {
    const permitted = renderToString(
      <SupportHistory
        items={[RUNNING, TENANT_ENDED]}
        nextCursor={null}
        showNewest={false}
        canEnd
      />
    );
    expect(permitted).toContain("End session");
    expect(permitted.match(/End session/g)).toHaveLength(1);

    const denied = renderToString(
      <SupportHistory
        items={[RUNNING]}
        nextCursor={null}
        showNewest={false}
        canEnd={false}
      />
    );
    expect(denied).not.toContain("End session");

    const ended = renderToString(
      <SupportHistory
        items={[TENANT_ENDED]}
        nextCursor={null}
        showNewest={false}
        canEnd
      />
    );
    expect(ended).not.toContain("End session");
  });

});
