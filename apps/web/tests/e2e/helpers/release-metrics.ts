import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __releaseGateMetrics?: ReleaseGateMetrics;
  }
}

/**
 * Core Web Vitals captured from the browser's own performance timeline.
 *
 * TBT is the standard long-task approximation: the sum of the portion of each
 * long task above 50 ms. It is deterministic in a local runner and is declared
 * as an approximation in the budget README.
 */

export interface ReleaseGateMetrics {
  readonly lcpMs: number;
  readonly cls: number;
  readonly tbtMs: number;
}

export interface StorefrontMetrics {
  readonly htmlBytes: number;
  readonly jsBytes: number;
  readonly cssBytes: number;
  readonly lcpMs: number;
  readonly tbtMs: number;
  readonly cls: number;
}

export interface MeasuredInteraction {
  readonly durationMs: number;
}

const SETTLE_MS = 1200;

export async function installMetricObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { lcpMs: 0, cls: 0, tbtMs: 0 };
    window.__releaseGateMetrics = state;
    interface LayoutShiftEntry extends PerformanceEntry {
      readonly value: number;
      readonly hadRecentInput: boolean;
    }
    function isLayoutShiftEntry(entry: PerformanceEntry): entry is LayoutShiftEntry {
      return "value" in entry && "hadRecentInput" in entry;
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.lcpMs = Math.max(state.lcpMs, entry.startTime);
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!isLayoutShiftEntry(entry) || entry.hadRecentInput) continue;
          state.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.tbtMs += Math.max(0, entry.duration - 50);
        }
      }).observe({ type: "longtask", buffered: true });
    } catch (error: unknown) {
      console.warn("Release-gate performance observers are unavailable:", error);
    }
  });
}

export async function readStorefrontMetrics(page: Page): Promise<StorefrontMetrics> {
  await page.waitForTimeout(SETTLE_MS);
  return page.evaluate(() => {
    interface ResourceEntry extends PerformanceResourceTiming {
      readonly encodedBodySize: number;
      readonly transferSize: number;
    }
    function isResourceEntry(entry: PerformanceEntry): entry is ResourceEntry {
      return "encodedBodySize" in entry && "transferSize" in entry;
    }
    const entries = performance.getEntriesByType("resource");
    let jsBytes = 0;
    let cssBytes = 0;
    for (const entry of entries) {
      if (!isResourceEntry(entry)) continue;
      const size = entry.encodedBodySize > 0 ? entry.encodedBodySize : entry.transferSize;
      const pathname = entry.name.split("?")[0] ?? "";
      if (pathname.endsWith(".js")) {
        jsBytes += size;
      } else if (pathname.endsWith(".css")) {
        cssBytes += size;
      }
    }
    const navigation = performance
      .getEntriesByType("navigation")
      .find((entry): entry is PerformanceNavigationTiming => "encodedBodySize" in entry);
    const documentBytes =
      navigation !== undefined && navigation.encodedBodySize > 0
        ? navigation.encodedBodySize
        : new TextEncoder().encode(document.documentElement.outerHTML).length;
    const metrics = window.__releaseGateMetrics ?? { lcpMs: 0, cls: 0, tbtMs: 0 };
    return {
      htmlBytes: documentBytes,
      jsBytes,
      cssBytes,
      lcpMs: metrics.lcpMs,
      tbtMs: metrics.tbtMs,
      cls: metrics.cls,
    };
  });
}

export async function measureInteraction(
  page: Page,
  action: () => Promise<void>
): Promise<MeasuredInteraction> {
  const startedAt = await page.evaluate(() => performance.now());
  await action();
  const endedAt = await page.evaluate(() => performance.now());
  return { durationMs: Math.max(0, endedAt - startedAt) };
}

export function percentile95(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index] ?? 0;
}
