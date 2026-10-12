import { describe, expect, it } from "vitest";
import {
  CmsEvents,
  OutboxWriter,
  OutboxWorker,
  CmsEventEnvelopeSchema,
} from "../src/index.js";

describe("Transactional Outbox Event Pipeline (S1-6)", () => {
  const writer = new OutboxWriter();
  const worker = new OutboxWorker();

  it("should stage cms.page.published event with valid envelope and schemaVersion", () => {
    const record = writer.stageEvent({
      eventName: CmsEvents.PAGE_PUBLISHED,
      aggregateId: "page_123",
      organizationId: "org_abc",
      siteId: "site_xyz",
      schemaVersion: 1,
      data: {
        pageId: "page_123",
        slug: "/rooms",
        title: "Deluxe Rooms",
        revision: 2,
        publishedAt: new Date().toISOString(),
        surrogateKey: "site:site_xyz page:page_123",
      },
    });

    expect(record.eventName).toBe(CmsEvents.PAGE_PUBLISHED);
    expect(record.status).toBe("PENDING");
    expect(record.payload.source).toBe("app.website-builder");
    expect(record.payload.schemaVersion).toBe(1);

    const parseResult = CmsEventEnvelopeSchema.safeParse(record.payload);
    expect(parseResult.success).toBe(true);
  });

  it("should stage cms.form.submitted event without raw PII in envelope", () => {
    const record = writer.stageEvent({
      eventName: CmsEvents.FORM_SUBMITTED,
      aggregateId: "csub_789",
      organizationId: "org_abc",
      siteId: "site_xyz",
      schemaVersion: 1,
      data: {
        submissionId: "csub_789",
        blockId: "block_form_1",
        idempotencyKey: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        submitterEmailHash: "hmac_salted_hash_val",
        attachmentCount: 0,
        submittedAt: new Date().toISOString(),
      },
    });

    expect(record.eventName).toBe(CmsEvents.FORM_SUBMITTED);
    expect(record.payload.data["submitterEmailHash"]).toBe("hmac_salted_hash_val");
    // Ensure raw email is not present in top-level event payload
    expect(record.payload.data["email"]).toBeUndefined();
  });

  it("should process outbox record and dispatch to target queues", async () => {
    const record = writer.stageEvent({
      eventName: CmsEvents.PAGE_PUBLISHED,
      aggregateId: "page_123",
      organizationId: "org_abc",
      siteId: "site_xyz",
      schemaVersion: 1,
      data: {
        pageId: "page_123",
        slug: "/rooms",
        title: "Deluxe Rooms",
        revision: 2,
        publishedAt: new Date().toISOString(),
        surrogateKey: "site:site_xyz page:page_123",
      },
    });

    const result = await worker.processRecord(record);
    expect(result.success).toBe(true);
    expect(result.dispatchedTo).toContain("edge_cdn_cache_purge");
    expect(result.dispatchedTo).toContain("sitemap_generator");
    expect(result.isDeadLetter).toBe(false);
  });

  it("should flag event for Dead-Letter Queue (DLQ) after maximum retries exceeded", async () => {
    const badRecord = {
      ...writer.stageEvent({
        eventName: CmsEvents.PAGE_PUBLISHED,
        aggregateId: "page_123",
        organizationId: "org_abc",
        siteId: "site_xyz",
        schemaVersion: 1,
        data: {},
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventName: "cms.unknown.event" as any,
      retryCount: 4, // Next failure will hit maxRetries (5)
    };

    const result = await worker.processRecord(badRecord);
    expect(result.success).toBe(false);
    expect(result.isDeadLetter).toBe(true);
  });

  it("should calculate exponential backoff delay with jitter properly", () => {
    const delay0 = worker.calculateBackoffDelayMs(0);
    const delay2 = worker.calculateBackoffDelayMs(2);
    const delay4 = worker.calculateBackoffDelayMs(4);

    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay2).toBeGreaterThanOrEqual(4000);
    expect(delay4).toBeGreaterThanOrEqual(16000);
    expect(delay4).toBeLessThanOrEqual(36000);
  });
});
