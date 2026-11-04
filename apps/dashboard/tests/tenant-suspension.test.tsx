import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { SuspensionNotice } from "../src/components/layout/suspension-notice";

describe("Suspension notice (FR-022)", () => {
  it("names the workspace, explains the suspension and offers the contact path", () => {
    const html = renderToString(
      <SuspensionNotice
        tenantName="River View Hospitality"
        status="SUSPENDED"
        supportEmail="support@businessos.com"
      />
    );

    expect(html).toContain("River View Hospitality");
    expect(html).toContain("This workspace is suspended");
    expect(html).toContain("Your data is retained");
    expect(html).toContain("mailto:support@businessos.com");
    expect(html).toContain("Sign out");
  });

  it("explains an archived workspace differently from a suspension", () => {
    const html = renderToString(
      <SuspensionNotice
        tenantName="Closed Tenant"
        status="ARCHIVED"
        supportEmail="support@businessos.com"
      />
    );

    expect(html).toContain("This workspace is archived");
    expect(html).toContain("should be restored");
    expect(html).not.toContain("This workspace is suspended");
  });

  it("falls back to the administrator instruction when no support address is configured", () => {
    const html = renderToString(
      <SuspensionNotice
        tenantName="River View Hospitality"
        status="SUSPENDED"
        supportEmail={null}
      />
    );

    expect(html).toContain("Contact your platform administrator");
    expect(html).not.toContain("mailto:");
  });

  it("marks the notice as a labelled landmark with a single heading", () => {
    const html = renderToString(
      <SuspensionNotice
        tenantName="River View Hospitality"
        status="SUSPENDED"
        supportEmail={null}
      />
    );

    expect(html).toContain('aria-labelledby="suspension-heading"');
    expect(html.match(/id="suspension-heading"/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });
});
