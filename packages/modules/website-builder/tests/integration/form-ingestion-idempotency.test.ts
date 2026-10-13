import { describe, expect, it, beforeAll } from "vitest";
import { prisma } from "@suite/db";
import {
  createFormRouter,
  FormService,
  IngestFormSubmissionResultSchema,
} from "../../src/index.js";

describe("Public Form Ingestion & Idempotency Suppression Integration Suite (S1-8)", () => {
  const service = new FormService();
  const router = createFormRouter(service);

  beforeAll(async () => {
    await prisma.organization.upsert({
      where: { id: "org_resort" },
      update: {},
      create: { id: "org_resort", name: "Resort Org", slug: "resort-org" },
    });
    await prisma.cmsSite.upsert({
      where: { id_organizationId: { id: "site_resort_01", organizationId: "org_resort" } },
      update: { status: "PUBLISHED" },
      create: {
        id: "site_resort_01",
        organizationId: "org_resort",
        title: "Resort Site",
        slug: "resort-site",
      },
    });
    await prisma.cmsFormSubmission.deleteMany({
      where: { siteId: "site_resort_01" },
    });
  });

  const sharedSubmissionBody = {
    payload: {
      fullName: "Jane Doe",
      email: "jane.doe@example.org",
      company: "Acme Hotels",
      message: "Requesting inquiry for villa booking.",
    },
    attachments: [],
    turnstileToken: "valid-turnstile-token",
  };

  it("suppresses rapid double-click submissions via two-tier UUIDv4 idempotency key", async () => {
    const idempotencyKey = "b4e85743-162e-4b68-b3d4-1a2c3d4e5f60";

    // 1. Initial click submission
    const firstRes = await router.request("/site_resort_01/block_contact_form/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(sharedSubmissionBody),
    });

    expect(firstRes.status).toBe(201);
    const firstData = (await firstRes.json()) as {
      success: boolean;
      submissionId: string;
      isDuplicate: boolean;
    };
    expect(firstData.success).toBe(true);
    expect(firstData.isDuplicate).toBe(false);
    expect(firstData.submissionId.startsWith("csub_")).toBe(true);

    const initialSubmissionId = firstData.submissionId;

    // 2. Immediate second click with identical idempotency key (double-click simulation)
    const secondRes = await router.request("/site_resort_01/block_contact_form/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(sharedSubmissionBody),
    });

    expect(secondRes.status).toBe(201);
    const secondData = (await secondRes.json()) as {
      success: boolean;
      submissionId: string;
      isDuplicate: boolean;
    };
    expect(secondData.success).toBe(true);
    // Duplicate suppression must mark isDuplicate as true without spawning new record
    expect(secondData.isDuplicate).toBe(true);
    expect(secondData.submissionId).toBe(initialSubmissionId);
  });

  it("silently traps automated bots when honeypot trap input is populated", async () => {
    const botIdempotencyKey = "c7d91e23-4567-489a-bcde-9876543210aa";
    const botPayload = {
      ...sharedSubmissionBody,
      honeypot: "http://spam-link-injected.com",
    };

    const botRes = await router.request("/site_resort_01/block_contact_form/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": botIdempotencyKey,
      },
      body: JSON.stringify(botPayload),
    });

    expect(botRes.status).toBe(400);
    const problem = (await botRes.json()) as { type: string; status: number; code?: string };
    expect(problem.type).toBe("about:blank");
    expect(problem.code).toBe("BOT_DETECTED");
    expect(problem.status).toBe(400);
  });

  it("blocks submissions lacking valid Cloudflare Turnstile token", async () => {
    const noCaptchaKey = "d8e02f34-5678-49ab-cdef-0123456789bb";
    const invalidTokenPayload = {
      ...sharedSubmissionBody,
      turnstileToken: "", // empty / omitted
    };

    const res = await router.request("/site_resort_01/block_contact_form/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": noCaptchaKey,
      },
      body: JSON.stringify(invalidTokenPayload),
    });

    expect(res.status).toBe(400);
    const problem = (await res.json()) as { type: string; status: number; code?: string };
    expect(problem.type).toBe("about:blank");
    expect(problem.code).toBe("INVALID_CAPTCHA");
    expect(problem.status).toBe(400);
  });

  it("enforces 64KB maximum JSON payload barrier with 413 Payload Too Large", async () => {
    const largePayloadKey = "e9f13a45-6789-40bc-def0-1234567890cc";
    const oversizedPayload = {
      payload: {
        giantString: "A".repeat(66000), // > 64KB
      },
      turnstileToken: "valid-turnstile-token",
    };

    const res = await router.request("/site_resort_01/block_contact_form/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": largePayloadKey,
      },
      body: JSON.stringify(oversizedPayload),
    });

    expect(res.status).toBe(413);
    const problem = (await res.json()) as { type: string; status: number; code?: string };
    expect(problem.type).toBe("about:blank");
    expect(problem.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("validates direct database security definer result schema matching IngestFormSubmissionResult", async () => {
    const rawResult = await service.submitForm({
      siteId: "site_test_suite",
      blockId: "block_suite",
      idempotencyKey: "f0a24b56-7890-41cd-ef01-2345678901dd",
      payload: { message: "Direct contract test" },
      turnstileToken: "valid-turnstile-token",
    });

    const validated = IngestFormSubmissionResultSchema.safeParse(rawResult);
    expect(validated.success).toBe(true);
    if (validated.success && validated.data.success) {
      expect(validated.data.submissionId).toBeDefined();
      expect(validated.data.isDuplicate).toBe(false);
    }
  });

  it("creates quarantined upload intent and enforces 10MB per-file barrier", async () => {
    // Valid 5MB file upload intent
    const validUploadRes = await router.request("/site_resort_01/upload-intent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "guest-passport.pdf",
        fileSizeBytes: 5 * 1024 * 1024,
        mimeType: "application/pdf",
      }),
    });

    expect(validUploadRes.status).toBe(200);
    const validData = (await validUploadRes.json()) as {
      uploadUrl: string;
      storageKey: string;
      maxSizeBytes: number;
    };
    expect(validData.storageKey).toContain("quarantine/site_resort_01");
    expect(validData.uploadUrl).toContain(validData.storageKey);
    expect(validData.uploadUrl).toContain("?signed=true");
    expect(validData.maxSizeBytes).toBe(10485760);

    // Rejected 15MB file upload intent (> 10MB limit)
    const oversizedUploadRes = await router.request("/site_resort_01/upload-intent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "raw-video-footage.mov",
        fileSizeBytes: 15 * 1024 * 1024,
        mimeType: "video/quicktime",
      }),
    });

    expect(oversizedUploadRes.status).toBe(400);
  });
});
