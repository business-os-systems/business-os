import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { recordEvidence } from "./evidence";

/** WCAG 2.1 A and AA — the declared release bar for every screen (FR-063). */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export interface FocusInfo {
  readonly tag: string;
  readonly id: string;
  readonly text: string;
  readonly ariaLabel: string | null;
}

export interface ScanSummary {
  readonly violationCount: number;
  readonly violationIds: readonly string[];
  readonly passCount: number;
}

export async function scanPage(page: Page, surface: string, url: string): Promise<ScanSummary> {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
  const summary = {
    violationCount: results.violations.length,
    violationIds: results.violations.map((violation) => violation.id),
    passCount: results.passes.length,
  };
  recordEvidence("a11y", {
    kind: "a11y",
    surface,
    url,
    capturedAt: new Date().toISOString(),
    ...summary,
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? "unknown",
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    })),
    impactCounts: results.violations.reduce<Record<string, number>>((counts, violation) => {
      const impact = violation.impact ?? "unknown";
      return { ...counts, [impact]: (counts[impact] ?? 0) + 1 };
    }, {}),
  });
  return summary;
}

export async function readFocus(page: Page): Promise<FocusInfo> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement)) {
      return { tag: "", id: "", text: "", ariaLabel: null };
    }
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id,
      text: element.textContent.trim(),
      ariaLabel: element.getAttribute("aria-label"),
    };
  });
}

export async function tabTo(
  page: Page,
  target: (focus: FocusInfo) => boolean,
  maxTabs = 40
): Promise<boolean> {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await readFocus(page);
    if (target(focus)) {
      return true;
    }
  }
  return false;
}
