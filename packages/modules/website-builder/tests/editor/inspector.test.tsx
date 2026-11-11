import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  BLOCK_FORM_CONFIGS,
  blockFormErrors,
  BlockPropertyInspector,
  writeFieldValue,
  readFieldValue,
} from "../../src/editor/inspector/index.js";
import type { BlockType, HeroBlockAst } from "../../src/ast/types.js";

const HEADLINE_LABEL = "Headline";
const HEADLINE = "headline" as const;
const HEADLINE_TEXT = "Harbour views";

const HERO: HeroBlockAst = {
  id: "blk_hero",
  type: "hero",
  props: { headline: HEADLINE_TEXT },
};

const SECTION = { id: "sec_hero", name: "Hero", blocks: [HERO] };

function renderInspector(canWrite = true): string {
  return renderToString(
    <BlockPropertyInspector
      block={HERO}
      section={SECTION}
      canWrite={canWrite}
      media={null}
      onChangeBlockProps={vi.fn()}
      onMoveBlock={vi.fn()}
      onDuplicateBlock={vi.fn()}
      onDeleteBlock={vi.fn()}
      onMoveSection={vi.fn()}
      onDuplicateSection={vi.fn()}
      onDeleteSection={vi.fn()}
      footer={<a href="/dashboard/sites/site_1/settings">Site settings</a>}
    />
  );
}

describe("Schema-driven block inspector (T067)", () => {
  it("declares a config for every production block type", () => {
    const types: BlockType[] = [
      "hero",
      "features",
      "pricing",
      "form",
      "faq",
      "rich-text",
      "navbar",
      "footer",
    ];
    expect(Object.keys(BLOCK_FORM_CONFIGS).sort()).toEqual([...types].sort());
  });

  it("mirrors the AST schema when validating field edits", () => {
    const missingHeadline = blockFormErrors(HERO, { [HEADLINE]: "" });
    expect(missingHeadline.headline).toBeDefined();
    const unsafeLink = blockFormErrors(HERO, {
      [HEADLINE]: HEADLINE_TEXT,
      primaryCta: { label: "Book", target: { url: "javascript:alert(1)" } },
    });
    expect(unsafeLink["primaryCta.target.url"]).toContain("http, https, mailto, or tel");
    expect(blockFormErrors(HERO, { [HEADLINE]: HEADLINE_TEXT })).toEqual({});
  });

  it("writes nested link fields without replacing the rest of the props", () => {
    const next = writeFieldValue({
      props: { [HEADLINE]: HEADLINE_TEXT },
      path: ["primaryCta", "target", "url"],
      raw: "/rooms",
    });
    expect(readFieldValue(next, ["primaryCta", "target", "url"])).toBe("/rooms");
    expect(readFieldValue(next, ["headline"])).toBe(HEADLINE_TEXT);
  });

  it("renders the config-driven form and structural actions", () => {
    const html = renderInspector();
    expect(html).toContain('aria-label="Edit hero block"');
    expect(html).toContain(HEADLINE_LABEL);
    expect(html).toContain("Primary button label");
    expect(html).toContain("Primary button link");
    expect(html).toContain("Move section up");
    expect(html).toContain("Duplicate hero block");
    expect(html).toContain("Site settings");
  });

  it("disables structural actions for a read-only session", () => {
    const html = renderInspector(false);
    expect(html).toContain('aria-label="Move section up"');
    expect(html).toContain('aria-label="Duplicate hero block"');
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
