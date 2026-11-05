import { describe, expect, it } from "vitest";
import {
  worstHealthState,
  type DependencyHealth,
} from "../src/services/admin/health.service.js";
import {
  summarizeQueueHealth,
  type QueueMetric,
} from "../src/services/admin/queue-metrics.service.js";

function dependency(
  state: DependencyHealth["state"],
  criticality: DependencyHealth["criticality"] = "critical"
): DependencyHealth {
  return {
    name: "probe",
    state,
    criticality,
    latencyMs: 1,
    lastCheckedAt: new Date().toISOString(),
    detail: "probe",
  };
}

function queue(overrides: Partial<QueueMetric> = {}): QueueMetric {
  return {
    name: "email-queue",
    kind: "bullmq",
    waiting: 0,
    active: 0,
    failed: 0,
    delayed: 0,
    oldestFailedAgeMs: null,
    state: "healthy",
    detail: "Connected",
    ...overrides,
  };
}

describe("Platform health aggregation", () => {
  it("reports healthy when every dependency is healthy", () => {
    expect(worstHealthState([dependency("healthy"), dependency("healthy")])).toBe(
      "healthy"
    );
  });

  it("reports degraded when one dependency is degraded", () => {
    expect(worstHealthState([dependency("healthy"), dependency("degraded")])).toBe(
      "degraded"
    );
  });

  it("reports unavailable when the critical datastore is unavailable", () => {
    expect(
      worstHealthState([
        dependency("degraded", "supporting"),
        dependency("unavailable", "critical"),
      ])
    ).toBe("unavailable");
  });

  it("reports degraded when only a supporting dependency is unavailable", () => {
    expect(
      worstHealthState([
        dependency("healthy", "critical"),
        dependency("unavailable", "supporting"),
      ])
    ).toBe("degraded");
  });

  it("reports degraded when a supporting dependency is degraded", () => {
    expect(
      worstHealthState([
        dependency("healthy", "critical"),
        dependency("degraded", "supporting"),
      ])
    ).toBe("degraded");
  });
});

describe("Queue health summary", () => {
  it("reports healthy when every queue connected with no failures", () => {
    expect(summarizeQueueHealth([queue(), queue({ name: "platform-outbox" })])).toEqual({
      state: "healthy",
      detail: "All queues connected with no failed items",
    });
  });

  it("reports degraded and names the age when a failed item exists", () => {
    const summary = summarizeQueueHealth([
      queue({ failed: 2, state: "degraded", oldestFailedAgeMs: 90_000 }),
    ]);
    expect(summary.state).toBe("degraded");
    expect(summary.detail).toContain("2 failed item(s)");
    expect(summary.detail).toContain("90s old");
  });

  it("reports degraded when one queue backend is unreachable", () => {
    const summary = summarizeQueueHealth([
      queue(),
      queue({ name: "platform-outbox", kind: "outbox", state: "unavailable" }),
    ]);
    expect(summary.state).toBe("degraded");
    expect(summary.detail).toContain("platform-outbox");
  });

  it("reports unavailable when no queue backend is reachable", () => {
    const summary = summarizeQueueHealth([
      queue({ state: "unavailable" }),
      queue({ name: "platform-outbox", kind: "outbox", state: "unavailable" }),
    ]);
    expect(summary.state).toBe("unavailable");
    expect(summary.detail).toContain("No queue backend reachable");
  });
});
