import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import HomePage from "../src/app/page.js";

describe("Dashboard App Scaffold", () => {
  it("renders the home launch page with brand title and port 3001 indicator", () => {
    const html = renderToString(<HomePage />);
    expect(html).toContain("Composable Business OS");
    expect(html).toContain("Port 3001 Ready");
    expect(html).toContain("Next.js 15 App Router");
    expect(html).toContain("Launch Studio");
  });
});
