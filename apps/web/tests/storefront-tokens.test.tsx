import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_APPEARANCE_TOKENS } from "@suite/website-builder/appearance";
import { StorefrontPageView } from "../src/components/storefront/page-view";
import type { StorefrontPage } from "../src/lib/storefront/contract";

const SITE_AST: StorefrontPage["ast"] = {
  version: 1,
  schemaVersion: "2026-03",
  meta: { title: "Acme home", description: "Acme description" },
  sections: [
    {
      id: "section_nav",
      blocks: [
        {
          id: "nav_home",
          type: "navbar",
          props: {
            logoText: "Acme",
            items: [{ id: "nav_about", label: "About", target: { url: "/about" } }],
          },
        },
      ],
    },
    {
      id: "section_home",
      blocks: [
        {
          id: "hero_home",
          type: "hero",
          props: {
            headline: "Published headline",
            subheadline: "Published subheadline",
            primaryCta: { label: "Book", target: { url: "/book" } },
          },
        },
      ],
    },
    {
      id: "section_footer",
      blocks: [
        {
          id: "footer_home",
          type: "footer",
          props: {
            logoText: "Acme",
            copyrightText: "© 2026 Acme",
            columns: [
              {
                id: "footer_legal",
                title: "Legal",
                links: [{ id: "footer_terms", label: "Terms", target: { url: "/terms" } }],
              },
            ],
          },
        },
      ],
    },
  ],
};

const FIRST_PAGE: StorefrontPage = {
  title: "Acme home",
  path: "/",
  ast: SITE_AST,
  media: {},
  tokens: {
    ...DEFAULT_APPEARANCE_TOKENS,
    colorBackground: "#F0E8E2",
    colorSurface: "#FBF7F5",
    colorText: "#201B18",
    colorTextMuted: "#6E625D",
  },
};

const SECOND_PAGE: StorefrontPage = {
  ...FIRST_PAGE,
  tokens: {
    ...FIRST_PAGE.tokens,
    colorBackground: "#101010",
    colorSurface: "#1D1D1D",
    colorText: "#F5F5F5",
    colorTextMuted: "#C4B8B2",
  },
};

describe("Published page renders from site tokens only (F11, FR-153)", () => {
  it("changes visibly when the site token set changes, with no content edit", () => {
    const firstHtml = renderToStaticMarkup(<StorefrontPageView page={FIRST_PAGE} />);
    const secondHtml = renderToStaticMarkup(<StorefrontPageView page={SECOND_PAGE} />);

    expect(firstHtml).toContain("--cms-color-background:#F0E8E2");
    expect(secondHtml).toContain("--cms-color-background:#101010");
    expect(firstHtml).toContain("--cms-color-surface:#FBF7F5");
    expect(secondHtml).toContain("--cms-color-surface:#1D1D1D");

    // The navbar, hero and footer all reference the same site variables, so a
    // token change restyles the published page without touching content.
    for (const html of [firstHtml, secondHtml]) {
      expect(html).toContain("background-color:var(--cms-color-surface");
      expect(html).toContain("background-color:var(--cms-color-background");
      expect(html).toContain("color:var(--cms-color-text");
      expect(html).toContain("color:var(--cms-color-text-muted");
    }
  });

  it("publishes no literal block colour or pixel spacing", () => {
    const html = renderToStaticMarkup(<StorefrontPageView page={FIRST_PAGE} />);

    expect(html).toContain("Published headline");
    expect(html).toContain("Acme");
    expect(html).toContain("Terms");
    expect(html).not.toContain("#0f172a");
    expect(html).not.toContain("#cbd5e1");
    expect(html).not.toMatch(/background-color:#[0-9a-fA-F]{3,8}/);
    expect(html).not.toMatch(/padding-(?:top|bottom):\d+px/);
    expect(html).toContain("padding-top:var(--cms-space-section");
  });
});
