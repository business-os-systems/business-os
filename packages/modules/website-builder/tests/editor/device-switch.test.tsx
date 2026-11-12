import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DeviceSwitch } from "../../src/editor/canvas/index.js";

describe("Device switch (FR-025, FR-101)", () => {
  it("renders every viewport and marks the active one", () => {
    const html = renderToString(<DeviceSwitch device="tablet" onDeviceChange={vi.fn()} />);
    expect(html).toContain('aria-label="Switch to Desktop view"');
    expect(html).toContain('aria-label="Switch to Tablet view"');
    expect(html).toContain('aria-label="Switch to Mobile view"');
    expect(html).toMatch(/aria-pressed="true" aria-label="Switch to Tablet view"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Switch to Desktop view"/);
  });
});
