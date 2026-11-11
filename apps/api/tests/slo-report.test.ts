import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AVAILABILITY_SLO_TARGET,
  computeAvailability,
  defaultAvailabilityChecks,
  main,
  monthlyWindow,
  runAvailabilityCheck,
  runSloReport,
  sloAvailabilityGauge,
} from "../src/jobs/slo-report.js";

const REPORT_NOW: Date = new Date("2026-11-12T02:27:18Z");

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/ok") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
      return;
    }
    response.writeHead(500, { "content-type": "text/plain" });
    response.end("unavailable");
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The SLO test server did not bind a TCP port.");
  }
  baseUrl = "http://127.0.0.1:" + String(address.port);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
});

function result(ok: boolean) {
  return {
    name: "probe",
    url: "https://example.test/health",
    ok,
    statusCode: ok ? 200 : 500,
    durationMs: 1,
    error: ok ? null : "HTTP 500",
  };
}

describe("availability SLO report (FR-142, SC-017, T156)", () => {
  it("computes the monthly window in UTC", () => {
    const window = monthlyWindow(REPORT_NOW);
    expect(window.label).toBe("2026-11");
    expect(window.start.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("reports zero availability for a run with no checks", () => {
    expect(computeAvailability([])).toBe(0);
  });

  it("meets the 99.9% target only at or above 999 of 1000 checks", () => {
    const met = Array.from({ length: 1000 }, (_, index) => result(index < 999));
    const missed = Array.from({ length: 1000 }, (_, index) => result(index < 998));
    expect(computeAvailability(met)).toBe(0.999);
    expect(computeAvailability(missed)).toBe(0.998);
    expect(computeAvailability(met) >= AVAILABILITY_SLO_TARGET).toBe(true);
    expect(computeAvailability(missed) >= AVAILABILITY_SLO_TARGET).toBe(false);
  });

  it("probes the deployment over HTTP and reports failing checks", async () => {
    const report = await runSloReport({
      checks: [
        { name: "api-health", url: baseUrl + "/ok" },
        { name: "workspace", url: baseUrl + "/down" },
      ],
      now: REPORT_NOW,
      timeoutMs: 1000,
    });
    expect(report.availability).toBe(0.5);
    expect(report.successfulChecks).toBe(1);
    expect(report.totalChecks).toBe(2);
    expect(report.met).toBe(false);
    expect(report.results.map((entry) => entry.statusCode)).toEqual([200, 500]);
    const gauge = await sloAvailabilityGauge.get();
    expect(gauge.values.find((value) => value.labels.month === "2026-11")?.value).toBe(0.5);
  });

  it("records an unreachable target as a failed check with the reason", async () => {
    const probe = await runAvailabilityCheck(
      { name: "closed-port", url: "http://127.0.0.1:1/health" },
      fetch,
      1000,
    );
    expect(probe.ok).toBe(false);
    expect(probe.statusCode).toBeNull();
    expect(probe.error).not.toBeNull();
  });

});

describe("availability SLO job wiring (FR-142, SC-017, T131)", () => {
  it("builds the public checks from the declared API and dashboard URLs", () => {
    vi.stubEnv("API_URL", baseUrl);
    vi.stubEnv("DASHBOARD_URL", baseUrl);
    try {
      expect(defaultAvailabilityChecks()).toEqual([
        { name: "api-health", url: baseUrl + "/health" },
        { name: "workspace", url: baseUrl + "/" },
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("logs the monthly report from the job entrypoint", async () => {
    await main({
      checks: [{ name: "api-health", url: baseUrl + "/ok" }],
      now: REPORT_NOW,
    });
  });

  it("sets a failing exit code when the monthly target is missed", async () => {
    const previousExitCode = process.exitCode;
    try {
      await main({
        checks: [{ name: "workspace", url: baseUrl + "/down" }],
        now: REPORT_NOW,
      });
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it("refuses to report from a relative API_URL instead of silently skipping", () => {
    vi.stubEnv("API_URL", "/");
    try {
      expect(() => defaultAvailabilityChecks()).toThrow(/absolute URL/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
