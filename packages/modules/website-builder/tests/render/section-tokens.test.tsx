import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  DEFAULT_APPEARANCE_TOKENS,
  type AppearanceTokens,
} from "../../src/appearance/index.js";
import type { PageAst } from "../../src/ast/types.js";
import { AstRenderer, SectionRenderer } from "../../src/render/index.js";

const FIRST_TOKENS: AppearanceTokens = {
  ...DEFAULT_APPEARANCE_TOKENS,
  colorBackground: "#f0e8e2",
  colorSurface: "#fbf7f5",
  colorText: "#201b18",
  colorPrimary: "#8c2f22",
};

const SECOND_TOKENS: AppearanceTokens = {
  ...FIRST_TOKENS,
  colorBackground: "#101010",
  colorSurface: "#1d1d1d",
  colorText: "#f5f5f5",
  colorPrimary: "#2f8c7a",
};

const LEGACY_LITERAL_AST: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  globalStyles: { backgroundColor: "#123abc", textColor: "#abcdef" },
  sections: [
    {
      id: "sec_nav",
      styles: { backgroundColor: "#123abc", paddingTop: 96, customClassName: "bg-slate-900" },
      blocks: [
        {
          id: "b_nav",
          type: "navbar",
          props: { logoText: "Alpine Lodge", items: [] },
          styles: { backgroundColor: "#123abc", textColor: "#abcdef", paddingTop: 12 },
        },
      ],
    },
    {
      id: "sec_hero",
      blocks: [
        {
          id: "b_hero",
          type: "hero",
          props: { headline: "Tokenized hero" },
          styles: {
            backgroundColor: "#abcdef",
            paddingTop: 64,
            paddingBottom: 64,
            customClassName: "text-rose-500",
          },
        },
      ],
    },
  ],
};

const TOKEN_OVERRIDE_AST: PageAst = {
  version: 1,
  schemaVersion: "2026-03",
  sections: [
    {
      id: "sec_override",
      styles: { backgroundColor: "colorPrimary", backgroundOverlayColor: "colorText" },
      blocks: [
        {
          id: "b_override_hero",
          type: "hero",
          props: { headline: "Operator override" },
          styles: { backgroundColor: "colorSurface", textColor: "colorTextMuted" },
        },
      ],
    },
  ],
};

function renderPage(tokens: AppearanceTokens): string {
  return renderToString(<AstRenderer ast={LEGACY_LITERAL_AST} tokens={tokens} />);
}

describe("Sections render from site tokens only (F11, FR-153)", () => {
  it("ignores legacy literal colours and pixel spacing stored in the AST", () => {
    const html = renderPage(FIRST_TOKENS);

    expect(html).toContain("Alpine Lodge");
    expect(html).toContain("Tokenized hero");
    expect(html).toContain("background-color:var(--cms-color-background");
    expect(html).toContain("background-color:var(--cms-color-surface");
    expect(html).toContain("padding-top:var(--cms-space-section");
    expect(html).not.toContain("#123abc");
    expect(html).not.toContain("#abcdef");
    expect(html).not.toContain("padding-top:96px");
    expect(html).not.toContain("padding-top:64px");
    expect(html).not.toContain("bg-slate-900");
    expect(html).not.toContain("text-rose-500");
  });

  it("renders a changed token set on the same content without an edit", () => {
    const firstHtml = renderPage(FIRST_TOKENS);
    const secondHtml = renderPage(SECOND_TOKENS);

    expect(firstHtml).toContain("--cms-color-background:#f0e8e2");
    expect(secondHtml).toContain("--cms-color-background:#101010");
    expect(firstHtml).toContain("--cms-color-surface:#fbf7f5");
    expect(secondHtml).toContain("--cms-color-surface:#1d1d1d");

    // The block markup is identical because it references the tokens, so the
    // value change above is what a visitor sees.
    const blockSurfaceStyle = /background-color:var\(--cms-color-surface[^;"]*/;
    expect(blockSurfaceStyle.exec(firstHtml)?.[0]).toBe(
      blockSurfaceStyle.exec(secondHtml)?.[0]
    );
  });

  it("honours operator overrides that name declared appearance tokens", () => {
    const html = renderToString(
      <AstRenderer ast={TOKEN_OVERRIDE_AST} tokens={FIRST_TOKENS} />
    );

    expect(html).toContain("background-color:var(--cms-color-primary");
    expect(html).toContain("background-color:var(--cms-color-surface");
    expect(html).toContain("color:var(--cms-color-text-muted");
    expect(html).toContain("color:var(--cms-color-text");
  });

  it("keeps stored pages rendering without a site snapshot", () => {
    const html = renderToString(<AstRenderer ast={LEGACY_LITERAL_AST} />);

    expect(html).toContain("data-cms-page=\"true\"");
    expect(html).toContain("Tokenized hero");
    expect(html).toContain("background-color:#123abc");
    expect(html).toContain("var(--cms-color-background, var(--bos-bg))");
    expect(html).toContain("padding-top:var(--cms-space-section");
  });

  it("applies the section token rhythm without a stored numeric padding", () => {
    const html = renderToString(
      <SectionRenderer
        section={{ id: "sec_plain", blocks: [] }}
      />
    );

    expect(html).toContain("padding-top:var(--cms-space-section");
    expect(html).toContain("padding-bottom:var(--cms-space-section");
    expect(html).not.toMatch(/padding-(?:top|bottom):\d+px/);
  });
});
