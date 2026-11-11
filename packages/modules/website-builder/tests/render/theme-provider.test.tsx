import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { DEFAULT_APPEARANCE_TOKENS } from "../../src/appearance/index.js";
import { AstRenderer, ThemeProvider } from "../../src/render/index.js";
import type { PageAst } from "../../src/ast/types.js";

const TOKENS = {
  ...DEFAULT_APPEARANCE_TOKENS,
  colorPrimary: "#123456",
  fontHeading: "Georgia, serif",
};

describe("ThemeProvider (T115)", () => {
  it("exposes the site snapshot as CSS custom properties", () => {
    const html = renderToString(
      <ThemeProvider tokens={TOKENS}>
        <p>Preview</p>
      </ThemeProvider>
    );
    expect(html).toContain('data-cms-theme="true"');
    expect(html).toContain("--cms-color-primary:#123456");
    expect(html).toContain("--cms-font-heading:Georgia, serif");
    expect(html).toContain("Preview");
  });

  it("applies the snapshot in the renderer instead of page-level colours", () => {
    const ast: PageAst = {
      version: 1,
      schemaVersion: "2026-03",
      globalStyles: { backgroundColor: "#000000", textColor: "#ffffff" },
      sections: [],
    };
    const html = renderToString(<AstRenderer ast={ast} tokens={TOKENS} />);
    expect(html).toContain('data-cms-theme="true"');
    expect(html).toContain("--cms-color-primary:#123456");
    expect(html).toContain("var(--cms-color-background)");
  });

  it("keeps the legacy page-level styles when no site snapshot is supplied", () => {
    const ast: PageAst = {
      version: 1,
      schemaVersion: "2026-03",
      globalStyles: { backgroundColor: "#000000" },
      sections: [],
    };
    const html = renderToString(<AstRenderer ast={ast} />);
    expect(html).not.toContain('data-cms-theme="true"');
    expect(html).toContain("background-color:#000000");
  });
});
