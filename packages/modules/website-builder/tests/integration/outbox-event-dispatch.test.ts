import { describe, expect, it } from "vitest";
import {
  CmsEvents,
  OutboxWriter,
  OutboxWorker,
  FormService,
  type OutboxRecord,
} from "../../src/index.js";

describe("Transactional Outbox Event Dispatch Integration Suite (S1-8)", () => {
  const outboxWriter = new OutboxWriter();
  const outboxWorker = new OutboxWorker();
  const formService = new FormService();

  it("stages and processes cms.page.published domain event with CloudEvents envelope", async () => {
    // 1. Stage event via outbox writer
    const record = outboxWriter.stageEvent({
      eventName: CmsEvents.PAGE_PUBLISHED,
      aggregateId: "page_prod_99",
      organizationId: "org_enterprise",
      siteId: "site_corp_01",
      schemaVersion: 1,
      data: {
        pageId: "page_prod_99",
        siteId: "site_corp_01",
        slug: "/investors",
        versionNumber: 3,
        revision: 4,
        publishedAt: new Date().toISOString(),
      },
    });

    expect(record.status).toBe("PENDING");
    expect(record.eventName).toBe("cms.page.published");
    expect(record.payload.type).toBe("cms.page.published");
    expect(record.payload.source).toBe("app.website-builder");
    expect(record.payload.organizationId).toBe("org_enterprise");
    expect(record.payload.siteId).toBe("site_corp_01");
    expect(record.payload.schemaVersion).toBe(1);

    // 2. Process record via outbox worker
    const processResult = await outboxWorker.processRecord(record);
    expect(processResult.success).toBe(true);
    expect(processResult.isDeadLetter).toBe(false);
    expect(processResult.dispatchedTo).toContain("edge_cdn_cache_purge");
    expect(processResult.dispatchedTo).toContain("sitemap_generator");
  });

  it("stages cms.form.submitted event with zero raw PII and verified GDPR salted HMAC hash", async () => {
    const rawEmail = "Vip.Guest@LuxuryResort.com";
    const salt = "daily_rotating_hmac_salt_20261012";

    // Compute GDPR salted HMAC hash
    const emailHash = formService.computeEmailHash(rawEmail, salt);
    expect(emailHash).toHaveLength(64); // SHA-256 hex output

    // Stage form submission event
    const record = outboxWriter.stageEvent({
      eventName: CmsEvents.FORM_SUBMITTED,
      aggregateId: "csub_789abc",
      organizationId: "org_resorts",
      siteId: "site_beachfront",
      schemaVersion: 1,
      data: {
        submissionId: "csub_789abc",
        siteId: "site_beachfront",
        blockId: "block_lead_capture",
        submitterEmailHash: emailHash, // PII minimization: Salted hash only
        fieldCount: 4,
        hasAttachments: false,
        submittedAt: new Date().toISOString(),
      },
    });

    // Verify raw email is completely absent from payload data
    const eventData = record.payload.data as Record<string, unknown>;
    expect(eventData["email"]).toBeUndefined();
    expect(eventData["submitterEmail"]).toBeUndefined();
    expect(eventData["submitterEmailHash"]).toBe(emailHash);

    // Worker dispatches to CRM lead pipeline and transactional notification queue
    const processResult = await outboxWorker.processRecord(record);
    expect(processResult.success).toBe(true);
    expect(processResult.dispatchedTo).toContain("crm_lead_pipeline");
    expect(processResult.dispatchedTo).toContain("notification_dispatcher");
  });

  it("stages cms.domain.verified event and dispatches to edge SSL cert provisioner", async () => {
    const record = outboxWriter.stageEvent({
      eventName: CmsEvents.DOMAIN_VERIFIED,
      aggregateId: "dom_custom_domain_42",
      organizationId: "org_hospitality",
      siteId: "site_grand_hotel",
      schemaVersion: 1,
      data: {
        domainId: "dom_custom_domain_42",
        siteId: "site_grand_hotel",
        hostname: "grandhotel.example.org",
        verificationMethod: "DNS_TXT",
        verifiedAt: new Date().toISOString(),
      },
    });

    const processResult = await outboxWorker.processRecord(record);
    expect(processResult.success).toBe(true);
    expect(processResult.dispatchedTo).toContain("ssl_cert_provisioner");
  });

  it("handles worker dispatch failures, exponential backoff, and dead-letter queue escalation", async () => {
    // 1. Calculate backoff delays
    const delay0 = outboxWorker.calculateBackoffDelayMs(0);
    const delay1 = outboxWorker.calculateBackoffDelayMs(1);
    const delay2 = outboxWorker.calculateBackoffDelayMs(2);

    expect(delay0).toBeGreaterThanOrEqual(1000);
    expect(delay1).toBeGreaterThanOrEqual(delay0);
    expect(delay2).toBeGreaterThanOrEqual(delay1);

    // 2. Unhandled event type generates error
    const bogusRecord: OutboxRecord = {
      id: "rec_unknown",
      eventName: "unsupported.event.type",
      aggregateId: "agg_1",
      organizationId: "org_1",
      siteId: "site_1",
      payload: {
        id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a99",
        type: "unsupported.event.type",
        source: "app.website-builder",
        organizationId: "org_1",
        siteId: "site_1",
        schemaVersion: 1,
        data: {},
        timestamp: new Date().toISOString(),
      },
      status: "PENDING",
      retryCount: 4, // 5th attempt will trigger DLQ
      createdAt: new Date().toISOString(),
    };

    const failResult = await outboxWorker.processRecord(bogusRecord);
    expect(failResult.success).toBe(false);
    expect(failResult.error).toContain("Unhandled event type");
    expect(failResult.isDeadLetter).toBe(true); // Exceeded 5 max retries -> Dead Letter Queue
  });
});
