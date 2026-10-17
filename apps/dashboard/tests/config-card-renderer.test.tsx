import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { ConfigCardRenderer } from "../src/components/config-renderers/config-card-renderer.js";

describe("ConfigCardRenderer Declarative Tile", () => {
  it("renders metric tile with title, value, badge and description", () => {
    const html = renderToString(
      <ConfigCardRenderer
        card={{
          id: "m1",
          title: "Active Team Members",
          value: "24",
          badge: "Enterprise",
          description: "4 invited pending onboarding",
        }}
      />
    );

    expect(html).toContain("Active Team Members");
    expect(html).toContain("24");
    expect(html).toContain("Enterprise");
    expect(html).toContain("4 invited pending onboarding");
  });

  it("renders positive trend indicator with success styling", () => {
    const html = renderToString(
      <ConfigCardRenderer
        card={{
          id: "m2",
          title: "Monthly Invoiced Volume",
          value: "₹4,20,000",
          trend: {
            value: "+18.2%",
            positive: true,
          },
        }}
      />
    );

    expect(html).toContain("+18.2%");
    expect(html).toContain("text-success");
  });

  it("renders negative trend indicator with danger styling", () => {
    const html = renderToString(
      <ConfigCardRenderer
        card={{
          id: "m3",
          title: "Occupancy Rate",
          value: "62%",
          trend: {
            value: "-4.5%",
            positive: false,
          },
        }}
      />
    );

    expect(html).toContain("-4.5%");
    expect(html).toContain("text-danger");
  });
});
