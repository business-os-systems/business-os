import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { AstRenderer, SectionRenderer } from "../../src/render/index.js";
import type { PageAst, SectionAst, BlockAst } from "../../src/ast/types.js";

describe("AST Page & Section Component Renderer", () => {
  const samplePageAst: PageAst = {
    version: 1,
    schemaVersion: "2026-03",
    globalStyles: {
      fontFamily: "Inter, sans-serif",
      backgroundColor: "#fafafa",
    },
    sections: [
      {
        id: "sec_nav",
        blocks: [
          {
            id: "b_nav",
            type: "navbar",
            props: {
              logoText: "Alpine Lodge",
              items: [{ id: "l1", label: "Rooms", target: { url: "/rooms" } }],
            },
          },
        ],
      },
      {
        id: "sec_hero",
        styles: { maxWidth: "xl", paddingTop: 40, paddingBottom: 40 },
        blocks: [
          {
            id: "b_hero",
            type: "hero",
            props: {
              headline: "Discover Alpine Wilderness",
              primaryCta: { label: "Book Now", target: { url: "/book" } },
            },
          },
        ],
      },
      {
        id: "sec_faq",
        visibility: { hideOnMobile: true },
        blocks: [
          {
            id: "b_faq",
            type: "faq",
            props: {
              headline: "Common Questions",
              items: [{ id: "q1", question: "Pets allowed?", answer: "Yes!" }],
            },
          },
        ],
      },
    ],
  };

  it("renders complete PageAst tree to HTML with global styles", () => {
    const html = renderToString(<AstRenderer ast={samplePageAst} />);
    expect(html).toContain("data-cms-page=\"true\"");
    expect(html).toContain("Alpine Lodge");
    expect(html).toContain("Discover Alpine Wilderness");
    expect(html).toContain("Common Questions");
    expect(html).toContain("Pets allowed?");
    expect(html).toContain("data-section-id=\"sec_hero\"");
    expect(html).toContain("data-section-id=\"sec_faq\"");
  });

  it("applies responsive visibility classes to sections correctly", () => {
    const section: SectionAst = {
      id: "sec_mobile_hidden",
      visibility: { hideOnMobile: true, hideOnDesktop: true },
      blocks: [],
    };

    const html = renderToString(<SectionRenderer section={section} />);
    expect(html).toContain("hidden sm:block");
    expect(html).toContain("lg:hidden");
  });

  it("renders unknown blocks gracefully without crashing in editor mode", () => {
    const unknownBlock = {
      id: "b_unknown",
      type: "custom-unsupported-block",
      props: {},
    } as unknown as BlockAst;

    const sectionWithUnknown: SectionAst = {
      id: "sec_unknown",
      blocks: [unknownBlock],
    };

    const editorHtml = renderToString(
      <SectionRenderer section={sectionWithUnknown} isEditor={true} />
    );
    expect(editorHtml).toContain("Unsupported or custom block type");

    const visitorHtml = renderToString(
      <SectionRenderer section={sectionWithUnknown} isEditor={false} />
    );
    expect(visitorHtml).not.toContain("Unsupported or custom block type");
  });

  it("resolves a media identity to its public URL at render time", () => {
    const assetId = "ma_render_1";
    const ast: PageAst = {
      version: 1,
      schemaVersion: "2026-03",
      sections: [
        {
          id: "sec_media",
          blocks: [
            {
              id: "b_media_hero",
              type: "hero",
              props: { headline: "Resolved hero", image: { kind: "asset", assetId } },
            },
          ],
        },
      ],
    };

    const html = renderToString(
      <AstRenderer
        ast={ast}
        media={{
          [assetId]: {
            assetId,
            url: "https://cdn.example.com/media/hero.png",
            fileName: "hero.png",
            width: 800,
            height: 600,
          },
        }}
      />
    );

    expect(html).toContain('src="https://cdn.example.com/media/hero.png"');
    expect(html).toContain('alt="hero.png"');
    expect(html).toContain('width="800"');
  });

  it("omits an unresolved asset instead of rendering a stale URL", () => {
    const ast: PageAst = {
      version: 1,
      schemaVersion: "2026-03",
      sections: [
        {
          id: "sec_missing_media",
          blocks: [
            {
              id: "b_missing_hero",
              type: "hero",
              props: {
                headline: "Missing hero",
                image: { kind: "asset", assetId: "ma_missing" },
              },
            },
          ],
        },
      ],
    };

    const html = renderToString(<AstRenderer ast={ast} />);
    expect(html).not.toContain("<img");
  });

  it("renders empty state placeholder when ast is empty", () => {
    const emptyAst = null as unknown as PageAst;
    const html = renderToString(<AstRenderer ast={emptyAst} />);
    expect(html).toContain("No content available to render.");
  });
});
