import { describe, expect, it } from "vitest";
import {
  createFormRouter,
  FormService,
  createWebsiteBuilderRoutes,
} from "../src/index.js";

describe("Public Form Ingestion Engine & Turnstile Defense (S1-5)", () => {
  const service = new FormService();
  const router = createFormRouter(service);
  const rootRouter = createWebsiteBuilderRoutes();

  const validSubmissionBody = {
    payload: {
      name: "Rohit Bahuguna",
      email: "rohit@example.com",
      message: "Booking inquiry for next week.",
    },
    attachments: [],
    turnstileToken: "valid-turnstile-token",
  };

  it("should ingest a valid form submission with 201 Created and canonical ID", async () => {
    const res = await router.request("/site_123/block_456/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      },
      body: JSON.stringify(validSubmissionBody),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as { success: boolean; submissionId: string };
    expect(data.success).toBe(true);
    expect(data.submissionId.startsWith("csub_")).toBe(true);
  });

  it("should reject bot submission when honeypot field is filled", async () => {
    const botBody = {
      ...validSubmissionBody,
      honeypot: "automated-bot-content",
    };

    const res = await router.request("/site_123/block_456/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
      },
      body: JSON.stringify(botBody),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { type: string; status: number };
    expect(data.type).toContain("bot_detected");
  });

  it("should reject submission when Turnstile captcha token is missing or invalid", async () => {
    const invalidCaptchaBody = {
      ...validSubmissionBody,
      turnstileToken: "",
    };

    const res = await router.request("/site_123/block_456/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      },
      body: JSON.stringify(invalidCaptchaBody),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as { type: string; status: number };
    expect(data.type).toContain("invalid_captcha");
  });

  it("should reject payload exceeding 64KB with 413 Payload Too Large", async () => {
    const largePayload = {
      payload: {
        bloat: "x".repeat(70000), // > 64KB
      },
      turnstileToken: "valid-turnstile-token",
    };

    const res = await router.request("/site_123/block_456/submit", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
      },
      body: JSON.stringify(largePayload),
    });

    expect(res.status).toBe(413);
    const data = (await res.json()) as { type: string; status: number };
    expect(data.type).toContain("payload_too_large");
  });

  it("should generate a quarantined upload intent for attachments under 10MB", async () => {
    const res = await router.request("/site_123/upload-intent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "id-proof.pdf",
        fileSizeBytes: 2 * 1024 * 1024, // 2MB
        mimeType: "application/pdf",
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as { uploadUrl: string; storageKey: string };
    expect(data.uploadUrl).toContain("r2.business-os.site");
    expect(data.storageKey).toContain("quarantine/site_123");
  });

  it("should reject upload intent when file size exceeds 10MB", async () => {
    const res = await router.request("/site_123/upload-intent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fileName: "video.mp4",
        fileSizeBytes: 25 * 1024 * 1024, // 25MB (> 10MB)
        mimeType: "video/mp4",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("should route through module root router properly", async () => {
    const res = await rootRouter.request(
      "/storefront/forms/site_123/block_456/submit",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-idempotency-key": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a55",
        },
        body: JSON.stringify(validSubmissionBody),
      }
    );

    expect(res.status).toBe(201);
  });
});
