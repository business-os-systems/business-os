import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  BlockPropertyInspector,
  LinkTargetConfigurator,
  DesignTokenEditor,
  renderBlockPropertiesForm,
} from "../../src/editor/inspector/index.js";
import type { HeroBlockAst, RichTextBlockAst } from "../../src/ast/types.js";

describe("Block Property Inspector & Design Token Editor", () => {
  const sampleHeroBlock: HeroBlockAst = {
    id: "b_hero_123",
    type: "hero",
    props: {
      badge: "Exclusive Launch",
      headline: "Scalable Business OS",
      subheadline: "Next-generation headless modular engine",
      primaryCta: {
        label: "Get Started",
        target: { url: "/signup", openInNewTab: false },
      },
    },
    styles: {
      backgroundColor: "#0f172a",
      textColor: "#ffffff",
      paddingTop: 48,
      paddingBottom: 48,
      textAlign: "center",
      customClassName: "custom-hero-class",
    },
  };

  it("renders empty state placeholder when no block is selected", () => {
    const html = renderToString(
      <BlockPropertyInspector
        block={null}
        onChangeBlockProps={vi.fn()}
        onChangeBlockStyles={vi.fn()}
      />
    );

    expect(html).toContain("No Block Selected");
    expect(html).toContain("Click on any block on the canvas");
  });

  it("renders inspector panel with active block badge and form fields", () => {
    const html = renderToString(
      <BlockPropertyInspector
        block={sampleHeroBlock}
        onChangeBlockProps={vi.fn()}
        onChangeBlockStyles={vi.fn()}
      />
    );

    expect(html).toContain("hero");
    expect(html).toContain("b_hero_123");
    expect(html).toContain("Scalable Business OS");
    expect(html).toContain("Exclusive Launch");
    expect(html).toContain("Next-generation headless modular engine");
  });

  it("renders LinkTargetConfigurator with destination URL and new-tab toggle", () => {
    const html = renderToString(
      <LinkTargetConfigurator
        label="Primary CTA Link"
        target={{ url: "https://stripe.com", openInNewTab: true }}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain("Primary CTA Link");
    expect(html).toContain("https://stripe.com");
    expect(html).toContain("Open link in new tab");
  });

  it("renders DesignTokenEditor with color pickers, padding sliders, and alignment controls", () => {
    const html = renderToString(
      <DesignTokenEditor styles={sampleHeroBlock.styles} onChange={vi.fn()} />
    );

    expect(html).toContain("Style &amp; Design Tokens");
    expect(html).toContain("#0f172a");
    expect(html).toContain("#ffffff");
    expect(html).toContain("48");
    expect(html).toContain("px");
    expect(html).toContain("custom-hero-class");
  });

  it("dispatches specialized forms for different block types via dictionary registry", () => {
    const richTextBlock: RichTextBlockAst = {
      id: "b_rt_1",
      type: "rich-text",
      props: {
        contentHtml: "<h2>Article Section</h2><p>Body copy here...</p>",
      },
    };

    const html = renderToString(
      renderBlockPropertiesForm(richTextBlock, vi.fn())
    );

    expect(html).toContain("HTML Content");
    expect(html).toContain("Article Section");
  });
});
