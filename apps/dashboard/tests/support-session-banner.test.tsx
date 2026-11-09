import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SupportSessionBanner } from "../src/components/layout/support-session-banner";
import type { SupportSessionView } from "../src/lib/support-session-client";

const SESSION: SupportSessionView = {
  ticketId: "7c5f9f6e-2f1a-4f4c-9d2a-5b6f8c1d3e4f",
  operatorDisplayName: "Duty Operator",
  reason: "Investigating the billing discrepancy reported in SUP-237.",
  ticketRef: "SUP-237",
  startedAt: "2026-11-09T13:00:00.000Z",
  expiresAt: "2026-11-09T13:30:00.000Z",
};

describe("Support-session banner (FR-048)", () => {
  it("names the operator and the session expiry", () => {
    const html = renderToString(<SupportSessionBanner session={SESSION} />);

    expect(html).toContain("Support session active");
    expect(html).toContain("Duty Operator");
    expect(html).toContain("09 Nov 2026, 13:30 UTC");
    expect(html).toContain("Read-only");
  });

  it("is a labelled polite status region", () => {
    const html = renderToString(<SupportSessionBanner session={SESSION} />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Support session active"');
  });

  it("offers no dismiss control", () => {
    const html = renderToString(<SupportSessionBanner session={SESSION} />);

    expect(html).not.toContain("<button");
    expect(html.toLowerCase()).not.toContain("dismiss");
    expect(html.toLowerCase()).not.toContain("close");
  });
});
