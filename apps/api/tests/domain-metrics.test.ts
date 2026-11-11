import { describe, expect, it, vi } from "vitest";
import { logger } from "@suite/logger";
import { metricsRegistry } from "../src/telemetry.js";
import {
  DOMAIN_OPERATIONS,
  domainOperationCounter,
  measureDomainOperation,
  measureDomainOperationSafely,
  recordDomainFailure,
} from "../src/services/admin/domain-metrics.service.js";

async function counterValue(operation: string, outcome: string): Promise<number> {
  const metric = await domainOperationCounter.get();
  return (
    metric.values.find(
      (value) => value.labels.operation === operation && value.labels.outcome === outcome,
    )?.value ?? 0
  );
}

describe("Website Builder domain metrics (FR-065, T126, T157)", () => {
  it("registers the domain operation metrics on the shared registry", () => {
    expect(metricsRegistry.getSingleMetric("suite_domain_operations_total")).toBeDefined();
    expect(
      metricsRegistry.getSingleMetric("suite_domain_operation_duration_seconds"),
    ).toBeDefined();
  });

  it("records a successful operation without logging a failure", async () => {
    const before = await counterValue(DOMAIN_OPERATIONS.DELIVERY, "success");
    const result = await measureDomainOperation(
      DOMAIN_OPERATIONS.DELIVERY,
      { surface: "page" },
      () => Promise.resolve("published"),
    );
    expect(result).toBe("published");
    expect(await counterValue(DOMAIN_OPERATIONS.DELIVERY, "success")).toBe(before + 1);
  });

  it("counts a failed operation, logs typed context and rethrows the error", async () => {
    const errorSpy = vi.spyOn(logger, "error");
    const before = await counterValue(DOMAIN_OPERATIONS.FORM_INGESTION, "failure");
    const failure = new Error("inquiry write rejected");
    await expect(
      measureDomainOperation(
        DOMAIN_OPERATIONS.FORM_INGESTION,
        { siteId: "site_wt378", blockId: "block_wt378" },
        () => Promise.reject(failure),
      ),
    ).rejects.toBe(failure);
    expect(await counterValue(DOMAIN_OPERATIONS.FORM_INGESTION, "failure")).toBe(before + 1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DOMAIN_OPERATIONS.FORM_INGESTION,
        siteId: "site_wt378",
        error: "inquiry write rejected",
      }),
      "Website Builder domain operation failed",
    );
    errorSpy.mockRestore();
  });

});

describe("Website Builder domain failure metrics (FR-065, T157)", () => {
  it("records a maintenance failure without unwinding completed work", async () => {
    const errorSpy = vi.spyOn(logger, "error");
    const before = await counterValue(DOMAIN_OPERATIONS.VERSION_RETENTION, "failure");
    await expect(
      measureDomainOperationSafely(
        DOMAIN_OPERATIONS.VERSION_RETENTION,
        { organizationId: "org_wt378" },
        () => Promise.reject(new Error("prune failed"))
      )
    ).resolves.toBeUndefined();
    expect(await counterValue(DOMAIN_OPERATIONS.VERSION_RETENTION, "failure")).toBe(before + 1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("records a failure context without throwing from the logger helper", () => {
    const errorSpy = vi.spyOn(logger, "error");
    recordDomainFailure(DOMAIN_OPERATIONS.PUBLISH, new Error("release failed"), {
      organizationId: "org_wt378",
      siteId: "site_wt378",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: DOMAIN_OPERATIONS.PUBLISH,
        organizationId: "org_wt378",
        siteId: "site_wt378",
      }),
      "Website Builder domain operation failed",
    );
    errorSpy.mockRestore();
  });
});
