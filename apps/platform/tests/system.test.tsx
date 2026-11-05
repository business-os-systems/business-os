import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  HEALTH_STATES,
  QUEUE_STATES,
  type DependencyHealth,
  type PlatformHealth,
  type QueueMetric,
  type QueueMetrics,
  type ServiceBuildIdentity,
} from "../src/lib/system-api";
import {
  CRITICALITY_LABELS,
  EMPTY_COUNT_LABEL,
  QUEUE_KIND_LABELS,
  SYSTEM_REFRESH_INTERVAL_MS,
  TELEMETRY_STATE_PRESENTATION,
  UNKNOWN_AGE_LABEL,
  formatAge,
  formatCount,
  formatFailureAge,
  formatLatency,
  formatTimestamp,
  summarizeDependencies,
  summarizeQueues,
} from "../src/components/system/system.config";
import {
  createTelemetryController,
  type TelemetryControllerState,
  type TelemetrySnapshot,
} from "../src/components/system/telemetry-controller";
import { ErrorTrackingLink } from "../src/components/system/error-tracking-link";
import { HealthSummary } from "../src/components/system/health-summary";
import { OverviewView } from "../src/components/system/overview-view";
import { ProvenancePanel } from "../src/components/system/provenance-panel";
import { QueueSummary } from "../src/components/system/queue-summary";
import { RefreshStatus } from "../src/components/system/refresh-status";
import { SystemView } from "../src/components/system/system-view";
import type { TelemetryView } from "../src/components/system/use-system-telemetry";

const CHECKED_AT = "2026-11-05T06:31:25.000Z";
const CONSOLE_URL = "https://errors.example.com/console";
const REQUEST_FAILED = "Request failed";

function dependency(
  overrides: Partial<DependencyHealth> = {}
): DependencyHealth {
  return {
    name: "database",
    state: "healthy",
    criticality: "critical",
    latencyMs: 12.4,
    lastCheckedAt: CHECKED_AT,
    detail: "PostgreSQL core datastore",
    ...overrides,
  };
}

function service(
  overrides: Partial<ServiceBuildIdentity> = {}
): ServiceBuildIdentity {
  return {
    name: "api",
    version: "1.0.0",
    buildId: "a3dcb71",
    buildTimestamp: CHECKED_AT,
    environment: "production",
    ...overrides,
  };
}

function health(overrides: Partial<PlatformHealth> = {}): PlatformHealth {
  return {
    overall: "healthy",
    dependencies: [
      dependency(),
      dependency({ name: "cache", criticality: "supporting", latencyMs: 2 }),
      dependency({
        name: "background-processing",
        criticality: "supporting",
        latencyMs: null,
        detail: "All queues connected with no failed items",
      }),
    ],
    services: [service()],
    version: "1.0.0",
    buildTimestamp: CHECKED_AT,
    environment: "production",
    errorTrackingUrl: null,
    checkedAt: CHECKED_AT,
    ...overrides,
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

function queues(overrides: Partial<QueueMetrics> = {}): QueueMetrics {
  return {
    queues: [queue(), queue({ name: "platform-outbox", kind: "outbox" })],
    checkedAt: CHECKED_AT,
    ...overrides,
  };
}

describe("System presentation configuration", () => {
  it("maps every health state to a label and a semantic token class", () => {
    for (const state of HEALTH_STATES) {
      const presentation = TELEMETRY_STATE_PRESENTATION[state];
      expect(presentation.label.length).toBeGreaterThan(0);
      expect(presentation.textClassName.startsWith("text-")).toBe(true);
    }
  });

  it("declares a label for every criticality and queue kind", () => {
    expect(Object.keys(CRITICALITY_LABELS).sort()).toEqual([
      "critical",
      "supporting",
    ]);
    expect(Object.keys(QUEUE_KIND_LABELS).sort()).toEqual(["bullmq", "outbox"]);
  });

  it("refreshes at least every sixty seconds", () => {
    expect(SYSTEM_REFRESH_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
  });
});

describe("System value formatting", () => {
  it("renders timestamps in UTC regardless of the machine timezone", () => {
    expect(formatTimestamp(CHECKED_AT).endsWith("UTC")).toBe(true);
    expect(formatTimestamp(CHECKED_AT)).toContain("2026");
    expect(formatTimestamp("not-a-timestamp")).toBe("Unknown");
  });

  it("never invents a latency for an unmeasured dependency", () => {
    expect(formatLatency(null)).toBe("Not measured");
    expect(formatLatency(12.4)).toBe("12 ms");
  });

  it("renders a missing count as an explicit placeholder, never a zero", () => {
    expect(formatCount(null)).toBe(EMPTY_COUNT_LABEL);
    expect(formatCount(0)).toBe("0");
  });

  it("humanises the age of the oldest failure", () => {
    expect(formatAge(45_000)).toBe("45s");
    expect(formatAge(120_000)).toBe("2m");
    expect(formatAge(7_200_000)).toBe("2h");
    expect(formatAge(259_200_000)).toBe("3d");
  });

  it("never turns an unknown failure age into a claim of no failures", () => {
    expect(formatAge(null)).toBe(UNKNOWN_AGE_LABEL);
    expect(formatFailureAge(null, 0)).toBe("No failed item");
    expect(formatFailureAge(null, 3)).toBe(UNKNOWN_AGE_LABEL);
    expect(formatFailureAge(90_000, 3)).toBe("2m");
    expect(formatFailureAge(null, null)).toBe(EMPTY_COUNT_LABEL);
  });
});

describe("System summaries", () => {
  it("never claims health while a dependency probe has failed", () => {
    expect(summarizeDependencies(health())).toBe("All 3 dependencies healthy.");

    const unavailable = health({
      overall: "unavailable",
      dependencies: health().dependencies.map((entry) =>
        entry.name === "database" ? { ...entry, state: "unavailable" } : entry
      ),
    });
    expect(summarizeDependencies(unavailable)).toBe(
      "1 of 3 dependencies unavailable."
    );
  });

  it("reports degraded dependencies separately from unavailable ones", () => {
    const degraded = health({
      overall: "degraded",
      dependencies: health().dependencies.map((entry) =>
        entry.name === "cache" ? { ...entry, state: "degraded" } : entry
      ),
    });

    expect(summarizeDependencies(degraded)).toBe("1 of 3 dependencies degraded.");
  });

  it("summarises queue backlog and unreachable backends", () => {
    expect(summarizeQueues(queues())).toBe(
      "No failed items across the registered queues."
    );
    expect(
      summarizeQueues(
        queues({ queues: [queue({ state: "unavailable", failed: null })] })
      )
    ).toBe("1 of 1 queues unreachable.");
    expect(
      summarizeQueues(
        queues({ queues: [queue({ failed: null, state: "degraded" })] })
      )
    ).toBe("Queue counts unavailable.");
  });
});

describe("Health rendering", () => {
  it("shows the failing dependency by name with a text state", () => {
    const html = renderToString(
      <HealthSummary
        dependencies={[
          dependency(),
          dependency({ name: "cache", state: "unavailable" }),
        ]}
      />
    );

    expect(html).toContain("cache");
    expect(html).toContain("Unavailable");
    expect(html).toContain("checked");
    expect(html).toContain('aria-label="Health dependencies"');
  });

  it("shows provenance: environment, version, build and check time", () => {
    const html = renderToString(
      <ProvenancePanel
        overall="healthy"
        environment="production"
        version="1.0.0"
        checkedAt={CHECKED_AT}
        services={[
          service(),
          service({ name: "platform-dashboard", buildId: "abc123" }),
        ]}
      />
    );

    expect(html).toContain("production");
    expect(html).toContain("1.0.0");
    expect(html).toContain("a3dcb71");
    expect(html).toContain("abc123");
    expect(html).toContain('aria-label="Running services"');
  });
});

describe("Queue rendering", () => {
  it("shows queue counts, state and failure age for every queue", () => {
    const html = renderToString(
      <QueueSummary
        queues={[
          queue({ failed: 2, state: "degraded", oldestFailedAgeMs: 90_000 }),
          queue({ name: "platform-outbox", kind: "outbox" }),
        ]}
        checkedAt={CHECKED_AT}
      />
    );

    expect(html).toContain("email-queue");
    expect(html).toContain("platform-outbox");
    expect(html).toContain("Oldest failure");
    expect(html).toContain("2m");
    expect(html).toContain('aria-label="email-queue queue"');
  });

  it("marks an unreachable queue as unavailable rather than zero", () => {
    const html = renderToString(
      <QueueSummary
        queues={[
          queue({
            state: "unavailable",
            waiting: null,
            active: null,
            failed: null,
            delayed: null,
          }),
        ]}
        checkedAt={CHECKED_AT}
      />
    );

    expect(html).toContain("Unavailable");
    expect(html).toContain(EMPTY_COUNT_LABEL);
    expect(html).not.toContain(">0<");
  });
});

describe("Error-tracking console link", () => {
  it("renders an honest not-configured state instead of a fabricated link", () => {
    const html = renderToString(<ErrorTrackingLink href={null} />);

    expect(html).toContain("not configured");
    expect(html).toContain("PLATFORM_ERROR_TRACKING_URL");
    expect(html).not.toContain("<a");
  });

  it("renders one keyboard-reachable link when a console URL is configured", () => {
    const html = renderToString(<ErrorTrackingLink href={CONSOLE_URL} />);

    expect(html).toContain(`href="${CONSOLE_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Open error-tracking console");
    expect(html).toContain("focus-visible:ring-2");
  });

  it("refuses to render a non-http(s) destination as a link", () => {
    const html = renderToString(
      <ErrorTrackingLink href="javascript:alert(1)" />
    );

    expect(html).not.toContain("javascript:alert(1)");
    expect(html).not.toContain("<a");
    expect(html).toContain("not configured");
  });
});

describe("Refresh status", () => {
  it("announces the last successful read politely", () => {
    const html = renderToString(
      <RefreshStatus
        receivedAt={CHECKED_AT}
        isRefreshing={false}
        refreshError={null}
      />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("refreshes every 60 seconds");
  });

  it("announces an in-flight refresh", () => {
    const html = renderToString(
      <RefreshStatus receivedAt={CHECKED_AT} isRefreshing refreshError={null} />
    );

    expect(html).toContain("Refreshing platform telemetry");
  });

  it("surfaces a failed refresh without hiding the last good reading", () => {
    const html = renderToString(
      <RefreshStatus
        receivedAt={CHECKED_AT}
        isRefreshing={false}
        refreshError={REQUEST_FAILED}
      />
    );

    expect(html).toContain("Refresh failed");
    expect(html).toContain(REQUEST_FAILED);
    expect(html).toContain("Last checked");
  });
});

function createFakeTimer() {
  const timers = new Map<number, () => void>();
  const intervals: number[] = [];
  let nextHandle = 0;
  return {
    timers,
    intervals,
    setTimer: (handler: () => void, intervalMs: number) => {
      nextHandle += 1;
      timers.set(nextHandle, handler);
      intervals.push(intervalMs);
      return nextHandle;
    },
    clearTimer: (handle: number) => {
      timers.delete(handle);
    },
  };
}

function readSoleTimer(timers: Map<number, () => void>): () => void {
  const handler = [...timers.values()][0];
  if (handler === undefined) {
    throw new Error("The controller did not register a timer");
  }
  return handler;
}

const SNAPSHOT: TelemetrySnapshot = {
  health: {
    overall: "healthy",
    dependencies: [],
    services: [],
    version: "1.0.0",
    buildTimestamp: CHECKED_AT,
    environment: "production",
    errorTrackingUrl: null,
    checkedAt: CHECKED_AT,
  },
  queues: { queues: [], checkedAt: CHECKED_AT },
};

function lastState(states: readonly TelemetryControllerState[]): TelemetryControllerState {
  const state = states[states.length - 1];
  if (state === undefined) {
    throw new Error("The controller emitted no state");
  }
  return state;
}

describe("Telemetry controller", () => {
  it("starts exactly one interval and reads immediately", async () => {
    const fake = createFakeTimer();
    const states: TelemetryControllerState[] = [];
    const controller = createTelemetryController<number>({
      load: () => Promise.resolve(SNAPSHOT),
      intervalMs: SYSTEM_REFRESH_INTERVAL_MS,
      onChange: (state) => states.push(state),
      now: () => CHECKED_AT,
      setTimer: fake.setTimer,
      clearTimer: fake.clearTimer,
    });

    controller.start();
    controller.start();

    expect(fake.timers.size).toBe(1);
    expect(fake.intervals).toEqual([SYSTEM_REFRESH_INTERVAL_MS]);
    await vi.waitFor(() => expect(lastState(states).view.kind).toBe("ready"));
  });

  it("aborts the in-flight read when the interval fires", () => {
    const fake = createFakeTimer();
    const signals: AbortSignal[] = [];
    const controller = createTelemetryController<number>({
      load: (signal) => {
        signals.push(signal);
        return new Promise<TelemetrySnapshot>(() => undefined);
      },
      intervalMs: 1_000,
      onChange: () => undefined,
      now: () => CHECKED_AT,
      setTimer: fake.setTimer,
      clearTimer: fake.clearTimer,
    });

    controller.start();
    readSoleTimer(fake.timers)();

    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });

  it("clears the timer and aborts the in-flight read on stop", () => {
    const fake = createFakeTimer();
    const signals: AbortSignal[] = [];
    const controller = createTelemetryController<number>({
      load: (signal) => {
        signals.push(signal);
        return new Promise<TelemetrySnapshot>(() => undefined);
      },
      intervalMs: 1_000,
      onChange: () => undefined,
      now: () => CHECKED_AT,
      setTimer: fake.setTimer,
      clearTimer: fake.clearTimer,
    });

    controller.start();
    controller.stop();
    controller.stop();

    expect(fake.timers.size).toBe(0);
    expect(signals[0]?.aborted).toBe(true);
  });
});

describe("Telemetry controller failures", () => {
  it("keeps the last good reading when a refresh fails", async () => {
    const fake = createFakeTimer();
    const states: TelemetryControllerState[] = [];
    let failNext = false;
    const controller = createTelemetryController<number>({
      load: () =>
        failNext
          ? Promise.reject(new Error(REQUEST_FAILED))
          : Promise.resolve(SNAPSHOT),
      intervalMs: 1_000,
      onChange: (state) => states.push(state),
      now: () => CHECKED_AT,
      setTimer: fake.setTimer,
      clearTimer: fake.clearTimer,
    });

    controller.start();
    await vi.waitFor(() => expect(lastState(states).view.kind).toBe("ready"));

    failNext = true;
    controller.refresh();

    await vi.waitFor(() => {
      const view = lastState(states).view;
      expect(view.kind).toBe("ready");
      if (view.kind === "ready") {
        expect(view.refreshError).toBe(REQUEST_FAILED);
      }
    });
  });

  it("reports an error view when the first read fails", async () => {
    const fake = createFakeTimer();
    const states: TelemetryControllerState[] = [];
    const controller = createTelemetryController<number>({
      load: () => Promise.reject(new Error(REQUEST_FAILED)),
      intervalMs: 1_000,
      onChange: (state) => states.push(state),
      now: () => CHECKED_AT,
      setTimer: fake.setTimer,
      clearTimer: fake.clearTimer,
    });

    controller.start();

    await vi.waitFor(() =>
      expect(lastState(states).view).toEqual({
        kind: "error",
        message: REQUEST_FAILED,
      })
    );
  });
});

describe("System and overview views", () => {
  const readyView: TelemetryView = {
    kind: "ready",
    health: health({ errorTrackingUrl: CONSOLE_URL }),
    queues: queues(),
    receivedAt: CHECKED_AT,
    refreshError: null,
  };

  it("renders provenance, dependencies, queues and the error link", () => {
    const html = renderToString(
      <SystemView
        view={readyView}
        isRefreshing={false}
        onRefresh={() => undefined}
      />
    );

    expect(html).toContain("Provenance");
    expect(html).toContain("Dependencies");
    expect(html).toContain("Queues");
    expect(html).toContain("Open error-tracking console");
    expect(html).toContain("Refresh now");
  });

  it("does not fabricate an error link when the control plane reports none", () => {
    const html = renderToString(
      <SystemView
        view={{ ...readyView, health: health() }}
        isRefreshing={false}
        onRefresh={() => undefined}
      />
    );

    expect(html).toContain("not configured");
    expect(html).not.toContain(CONSOLE_URL);
  });

  it("renders a loading state and an error state without a fake reading", () => {
    const loading = renderToString(
      <SystemView
        view={{ kind: "loading" }}
        isRefreshing
        onRefresh={() => undefined}
      />
    );
    const failed = renderToString(
      <SystemView
        view={{ kind: "error", message: REQUEST_FAILED }}
        isRefreshing={false}
        onRefresh={() => undefined}
      />
    );

    expect(loading).toContain("Reading platform telemetry");
    expect(failed).toContain("Telemetry unavailable");
    expect(failed).toContain(REQUEST_FAILED);
  });

});

describe("Overview view", () => {
  it("keeps the overall state visible and links to the system page", () => {
    const readyView: TelemetryView = {
      kind: "ready",
      health: health(),
      queues: queues(),
      receivedAt: CHECKED_AT,
      refreshError: null,
    };
    const html = renderToString(
      <OverviewView
        view={{
          ...readyView,
          health: health({
            overall: "degraded",
            dependencies: health().dependencies.map((entry) =>
              entry.name === "cache" ? { ...entry, state: "degraded" } : entry
            ),
          }),
        }}
        isRefreshing={false}
        onRefresh={() => undefined}
      />
    );

    expect(html).toContain("Platform degraded");
    expect(html).toContain("1 of 3");
    expect(html).toContain("production");
    expect(html).toContain("1.0.0");
    expect(html).toContain("a3dcb71");
    expect(html).toContain('href="/system"');
    expect(html).toContain("Refresh now");
  });
});

describe("Telemetry vocabulary", () => {
  it("keeps the queue vocabulary aligned with the health vocabulary", () => {
    expect([...QUEUE_STATES]).toEqual([...HEALTH_STATES]);
  });
});