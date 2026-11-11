import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  ReputationFeedUnavailableError,
  loadReputationFeed,
} from "../../src/services/abuse/reputation-feed.js";
import {
  ABUSE_SIGNALS,
  EXCESSIVE_HOST_CLAIM_LIMIT,
  REPUTATION_VERDICTS,
  classifyVerdict,
  normalizeHost,
  structuralSignals,
} from "../../src/services/abuse/reputation-policy.js";

let workDir: string | null = null;

async function directory(): Promise<string> {
  workDir ??= await mkdtemp(join(tmpdir(), "reputation-feed-"));
  return workDir;
}

afterAll(async () => {
  if (workDir !== null) await rm(workDir, { recursive: true, force: true });
});

describe("Structural abuse signals", () => {
  it("detects a reserved label", () => {
    expect(
      structuralSignals({ hostname: "admin.business-os.site", activeHostCount: 1 })
    ).toContain(ABUSE_SIGNALS.RESERVED_LABEL);
    expect(
      structuralSignals({ hostname: "river-view.business-os.site", activeHostCount: 1 })
    ).toEqual([]);
  });

  it("detects host impersonation without flagging an ordinary tenant subdomain", () => {
    expect(
      structuralSignals({ hostname: "business-os.business-os.site", activeHostCount: 1 })
    ).toContain(ABUSE_SIGNALS.HOST_IMPERSONATION);
    expect(
      structuralSignals({ hostname: "business-os.evil.example", activeHostCount: 1 })
    ).toContain(ABUSE_SIGNALS.HOST_IMPERSONATION);
    expect(
      structuralSignals({ hostname: "river-view.demo", activeHostCount: 1 })
    ).toEqual([]);
  });

  it("detects excessive host claims above the declared threshold", () => {
    expect(
      structuralSignals({
        hostname: "river-view.business-os.site",
        activeHostCount: EXCESSIVE_HOST_CLAIM_LIMIT + 1,
      })
    ).toContain(ABUSE_SIGNALS.EXCESSIVE_HOST_CLAIMS);
  });

  it("normalizes case and a trailing dot", () => {
    expect(normalizeHost(" River-View.Business-OS.Site. ")).toBe(
      "river-view.business-os.site"
    );
  });
});

describe("Verdict precedence", () => {
  it("reports an unavailable feed before any other verdict", () => {
    expect(
      classifyVerdict({ signals: [], blocked: true, feedUnavailable: true })
    ).toBe(REPUTATION_VERDICTS.FEED_UNAVAILABLE);
  });

  it("reports a blocked host before a structural review", () => {
    expect(
      classifyVerdict({
        signals: [ABUSE_SIGNALS.RESERVED_LABEL],
        blocked: true,
        feedUnavailable: false,
      })
    ).toBe(REPUTATION_VERDICTS.BLOCKED);
    expect(
      classifyVerdict({
        signals: [ABUSE_SIGNALS.RESERVED_LABEL],
        blocked: false,
        feedUnavailable: false,
      })
    ).toBe(REPUTATION_VERDICTS.REVIEW);
  });
});

describe("Reputation feed", () => {
  it("loads and normalizes a declarative blocklist", async () => {
    const path = join(await directory(), "feed.json");
    await writeFile(
      path,
      JSON.stringify({
        updatedAt: "2026-11-11T00:00:00.000Z",
        blockedHosts: ["Evil.Example"],
      })
    );
    const feed = await loadReputationFeed(path);
    expect(feed?.updatedAt).toBe("2026-11-11T00:00:00.000Z");
    expect(feed?.blockedHosts.has("evil.example")).toBe(true);
  });

  it("treats an absent feed as structural-only rather than an error", async () => {
    await expect(loadReputationFeed(null)).resolves.toBeNull();
  });

  it("fails closed on an unreadable or malformed feed", async () => {
    await expect(loadReputationFeed("/does/not/exist.json")).rejects.toBeInstanceOf(
      ReputationFeedUnavailableError
    );
    const path = join(await directory(), "bad.json");
    await writeFile(path, JSON.stringify({ blockedHosts: "not-an-array" }));
    await expect(loadReputationFeed(path)).rejects.toBeInstanceOf(
      ReputationFeedUnavailableError
    );
  });
});
