import React from "react";
import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { RichTextBlock } from "@suite/website-builder";

/**
 * P17 malicious-input boundary for the rich-text renderer. The sanitizer must
 * strip executable markup before the HTML reaches dangerouslySetInnerHTML,
 * while ordinary formatting survives.
 */

const MALICIOUS_PAYLOAD = [
  "<script>window.__xss = 1</script>",
  '<iframe src="https://evil.test"></iframe>',
  '<object data="evil"></object>',
  '<embed src="evil.swf">',
  '<img src="x" onerror="alert(1)">',
  '<svg onload="alert(1)"></svg>',
  '<p onclick="alert(1)">text</p>',
  '<a href="javascript:alert(1)">click</a>',
].join("");

const BENIGN_HTML =
  "<h2>Heading</h2><p><strong>Bold</strong> and <em>italic</em> text.</p>";

function renderRichText(contentHtml: string): string {
  return renderToString(
    <RichTextBlock props={{ contentHtml }} styles={{ paddingTop: 0 }} />
  );
}

describe("Rich text sanitizer malicious-input boundary", () => {
  it("strips executable tags and event handlers", () => {
    const html = renderRichText(MALICIOUS_PAYLOAD);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<object");
    expect(html).not.toContain("<embed");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("onload");
    expect(html).not.toContain("onclick");
  });

  it("strips javascript: URLs and script payload text", () => {
    const html = renderRichText(MALICIOUS_PAYLOAD);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("window.__xss");
    expect(html).toContain("text");
  });

  it("preserves safe formatting markup", () => {
    const html = renderRichText(BENIGN_HTML);
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });
});
