import { pathToFileURL } from "node:url";
import { logger } from "@suite/logger";
import { INQUIRY_RETENTION_DAYS, purgeExpiredInquiries } from "@suite/website-builder/inquiries";

/**
 * Daily retention job (T113, FR-049). Deletes inquiries at or past their
 * declared 365-day deadline in bounded batches. Erasure before the deadline is
 * a tenant operation (DELETE /api/v1/cms/inquiries/{id}, audited), never this job.
 */

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_MAX_BATCHES = 20;

export interface RetentionRunResult {
  readonly purged: number;
  readonly batches: number;
}

async function purgeBatches(input: {
  readonly batchSize: number;
  readonly maxBatches: number;
  readonly purged: number;
  readonly batches: number;
}): Promise<RetentionRunResult> {
  if (input.batches >= input.maxBatches) {
    return { purged: input.purged, batches: input.batches };
  }
  const removed = await purgeExpiredInquiries(input.batchSize);
  const total = { purged: input.purged + removed, batches: input.batches + 1 };
  if (removed < input.batchSize) {
    return total;
  }
  return purgeBatches({ ...input, ...total });
}

export async function runInquiryRetention(options: {
  readonly batchSize?: number;
  readonly maxBatches?: number;
} = {}): Promise<RetentionRunResult> {
  return purgeBatches({
    batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
    maxBatches: options.maxBatches ?? DEFAULT_MAX_BATCHES,
    purged: 0,
    batches: 0,
  });
}

async function main(): Promise<void> {
  const result = await runInquiryRetention();
  logger.info(
    "Inquiry retention (" + INQUIRY_RETENTION_DAYS + " days): purged " +
      result.purged + " row(s) in " + result.batches + " batch(es)."
  );
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  main().catch((error: unknown) => {
    console.error(
      "Inquiry retention failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exitCode = 1;
  });
}
