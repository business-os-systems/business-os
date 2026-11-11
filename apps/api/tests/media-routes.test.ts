import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { PLATFORM_ERROR_CODE, PERMISSIONS, problemDetailsSchema } from "@suite/core";
import {
  MediaInUseError,
  createMediaError,
  type MediaService,
} from "@suite/media";
import { createMediaRouter } from "../src/routes/media.js";
import { globalErrorHandler } from "../src/middleware/error-handler.js";
import { requestIdMiddleware } from "../src/middleware/request-id.js";
import { createAuthHeaders } from "./helpers/auth.js";

const ORGANIZATION_ID = "org_media_contract";
const WEBSITE_BUILDER_APP_ID = "website-builder";
const ASSET_ID = "ma_contract_1";
const USAGE_ID = "mu_contract_1";

const asset = {
  id: ASSET_ID,
  kind: "IMAGE",
  fileName: "hero.png",
  mimeType: "image/png",
  sizeBytes: 1_024,
  checksum: "a".repeat(64),
  width: 800,
  height: 600,
  url: "https://cdn.example.com/media/media/org/hero.png",
  status: "ACTIVE",
  usageCount: 0,
  createdAt: "2026-11-11T01:00:00.000Z",
} as const;

const usage = {
  id: USAGE_ID,
  assetId: ASSET_ID,
  appId: WEBSITE_BUILDER_APP_ID,
  resourceType: "Page",
  resourceId: "page_home",
  subKey: "hero",
  status: "DRAFT",
  createdAt: "2026-11-11T01:00:00.000Z",
} as const;

interface RecordedActor {
  organizationId: string;
  userId: string;
}

const intentView = {
  uploadUrl: "https://storage.example.com/bucket/key?X-Amz-Signature=abc",
  storageKey: "media/org/2026/11/key.png",
  expiresAt: "2026-11-11T01:15:00.000Z",
  maxBytes: 10_485_760,
  allowedTypes: ["image/png"],
  requiredHeaders: { "Content-Type": "image/png" },
};

function createStubService(): {
  service: MediaService;
  calls: RecordedActor[];
} {
  const calls: RecordedActor[] = [];
  const service: MediaService = {
    createUploadIntent(actor) {
      calls.push(actor);
      return Promise.resolve(intentView);
    },
    finalizeUpload(actor) {
      calls.push(actor);
      return Promise.resolve({
        assetId: ASSET_ID,
        url: asset.url,
        width: 800,
        height: 600,
        checksum: asset.checksum,
        storageBytes: 1_024,
        duplicate: false,
      });
    },
    listAssets(actor) {
      calls.push(actor);
      return Promise.resolve({ items: [asset], nextCursor: null });
    },
    getAsset(actor) {
      calls.push(actor);
      return Promise.resolve({ ...asset, usages: [usage] });
    },
    deleteAsset(actor) {
      calls.push(actor);
      return Promise.reject(
        new MediaInUseError([
          {
            appId: WEBSITE_BUILDER_APP_ID,
            resourceType: "Page",
            resourceId: "page_home",
            subKey: "hero",
          },
        ])
      );
    },
    registerUsage(actor) {
      calls.push(actor);
      return Promise.resolve(usage);
    },
    removeUsage(actor) {
      calls.push(actor);
      return Promise.resolve({ usageId: USAGE_ID, removed: true });
    },
  };
  return { service, calls };
}

function createTestApp(service: MediaService): Hono {
  const app = new Hono();
  app.use("*", requestIdMiddleware());
  app.onError(globalErrorHandler);
  app.route("/api/v1/media", createMediaRouter({ service }));
  return app;
}

async function authHeaders(
  permissions: readonly string[],
  organizationId = ORGANIZATION_ID
): Promise<Record<string, string>> {
  return createAuthHeaders({
    userId: "usr_media_contract",
    organizationId,
    permissions: [...permissions],
  });
}

const VALID_INTENT = {
  fileName: "hero.png",
  mimeType: "image/png",
  sizeBytes: 1_024,
  checksum: "a".repeat(64),
};

const listEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(z.object({ id: z.string() })),
    nextCursor: z.string().nullable(),
  }),
  requestId: z.string(),
});

const intentEnvelopeSchema = z.object({
  data: z.object({ uploadUrl: z.string(), storageKey: z.string() }),
});

const usageEnvelopeSchema = z.object({
  data: z.object({ id: z.string() }),
});

async function expectProblemCode(
  response: Response,
  code: string
): Promise<void> {
  const problem = problemDetailsSchema.parse(await response.json());
  expect(problem.code).toBe(code);
}

describe("media routes: capability denial", () => {
  it("rejects an unauthenticated request", async () => {
    const { service } = createStubService();
    const response = await createTestApp(service).request("/api/v1/media/assets");
    expect(response.status).toBe(401);
    const problem = problemDetailsSchema.parse(await response.json());
    // The shared auth middleware emits its established missing-session code.
    expect(problem.code).toBe("AUTH_UNAUTHORIZED");
    expect(problem.type).toBe("/errors/auth-unauthorized");
  });

  it("denies listing without media:read", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([
      PERMISSIONS.MEDIA.UPLOAD,
      PERMISSIONS.MEDIA.DELETE,
    ]);
    const response = await createTestApp(service).request(
      "/api/v1/media/assets",
      { headers }
    );
    expect(response.status).toBe(403);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
    expect(problem.type).toBe("/errors/capability-denied");
  });

  it("denies an upload intent without media:upload", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.READ]);
    const response = await createTestApp(service).request(
      "/api/v1/media/assets/upload-intent",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_INTENT),
      }
    );
    expect(response.status).toBe(403);
    await expectProblemCode(response, PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });

  it("denies deletion without media:delete", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([
      PERMISSIONS.MEDIA.READ,
      PERMISSIONS.MEDIA.UPLOAD,
    ]);
    const response = await createTestApp(service).request(
      `/api/v1/media/assets/${ASSET_ID}`,
      { method: "DELETE", headers }
    );
    expect(response.status).toBe(403);
    await expectProblemCode(response, PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });
});

describe("media routes: usage capability denial", () => {
  it("denies registering a usage without media:upload", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([
      PERMISSIONS.MEDIA.READ,
      PERMISSIONS.MEDIA.DELETE,
    ]);
    const response = await createTestApp(service).request(
      `/api/v1/media/assets/${ASSET_ID}/usage`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: WEBSITE_BUILDER_APP_ID,
          resourceType: "Page",
          resourceId: "page_home",
          subKey: "hero",
          status: "DRAFT",
        }),
      }
    );
    expect(response.status).toBe(403);
    await expectProblemCode(response, PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });

  it("denies removing a usage without media:upload", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([
      PERMISSIONS.MEDIA.READ,
      PERMISSIONS.MEDIA.DELETE,
    ]);
    const response = await createTestApp(service).request(
      `/api/v1/media/assets/${ASSET_ID}/usage/${USAGE_ID}`,
      { method: "DELETE", headers }
    );
    expect(response.status).toBe(403);
    await expectProblemCode(response, PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
  });
});

describe("media routes: mounting", () => {
  it("is mounted on the API behind authentication", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp({ enableRateLimiting: false });
    const response = await app.request("/api/v1/media/assets");
    expect(response.status).toBe(401);
  });
});

describe("media routes: reads", () => {
  it("lists assets for the verified session organization", async () => {
    const { service, calls } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.READ]);
    const response = await createTestApp(service).request(
      "/api/v1/media/assets?limit=10",
      { headers: { ...headers, "x-organization-id": "org_other" } }
    );
    expect(response.status).toBe(200);
    const body = listEnvelopeSchema.parse(await response.json());
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.nextCursor).toBeNull();
    expect(calls[0]?.organizationId).toBe(ORGANIZATION_ID);
  });

  it("returns a presigned intent without proxying bytes", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.UPLOAD]);
    const response = await createTestApp(service).request(
      "/api/v1/media/assets/upload-intent",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(VALID_INTENT),
      }
    );
    expect(response.status).toBe(200);
    const body = intentEnvelopeSchema.parse(await response.json());
    expect(body.data.uploadUrl).toContain("X-Amz-Signature");
    expect(body.data.storageKey.startsWith("media/")).toBe(true);
  });

});

describe("media routes: validation", () => {
  it("rejects a page size above the hard cap with problem details", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.READ]);
    const response = await createTestApp(service).request(
      "/api/v1/media/assets?limit=101",
      { headers }
    );
    expect(response.status).toBe(422);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  });

  it("rejects an unbounded pagination cursor at the boundary", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.READ]);
    const response = await createTestApp(service).request(
      `/api/v1/media/assets?cursor=${"a".repeat(257)}`,
      { headers }
    );
    expect(response.status).toBe(422);
    await expectProblemCode(response, PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  });

  it("rejects an undeclared mime type at the boundary", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.UPLOAD]);
    const response = await createTestApp(service).request(
      "/api/v1/media/assets/upload-intent",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_INTENT, mimeType: "image/svg+xml" }),
      }
    );
    expect(response.status).toBe(422);
    await expectProblemCode(response, PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  });

});

describe("media routes: problem details", () => {
  it("renders a not-found asset as RFC 7807 problem details", async () => {
    const { service } = createStubService();
    const notFound: MediaService = {
      ...service,
      getAsset() {
        return Promise.reject(
          createMediaError("MEDIA_ASSET_NOT_FOUND", "Media asset missing.")
        );
      },
    };
    const headers = await authHeaders([PERMISSIONS.MEDIA.READ]);
    const response = await createTestApp(notFound).request(
      "/api/v1/media/assets/missing",
      { headers }
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json"
    );
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.type).toBe("/errors/media-asset-not-found");
  });

  it("lists every published reference when deletion is refused", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.DELETE]);
    const response = await createTestApp(service).request(
      `/api/v1/media/assets/${ASSET_ID}`,
      { method: "DELETE", headers }
    );
    expect(response.status).toBe(409);
    const problem = problemDetailsSchema.parse(await response.json());
    expect(problem.code).toBe("MEDIA_IN_USE");
    expect(problem.invalidParams?.[0]).toEqual({
      name: "website-builder:Page",
      reason: "page_home#hero",
    });
  });

});

describe("media routes: mutations and OpenAPI", () => {
  it("registers a usage idempotently from the verified tenant", async () => {
    const { service } = createStubService();
    const headers = await authHeaders([PERMISSIONS.MEDIA.UPLOAD]);
    const response = await createTestApp(service).request(
      `/api/v1/media/assets/${ASSET_ID}/usage`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          appId: WEBSITE_BUILDER_APP_ID,
          resourceType: "Page",
          resourceId: "page_home",
          subKey: "hero",
          status: "DRAFT",
        }),
      }
    );
    expect(response.status).toBe(200);
    const body = usageEnvelopeSchema.parse(await response.json());
    expect(body.data.id).toBe(USAGE_ID);
  });

  it("declares every media endpoint in the OpenAPI document", () => {
    const { service } = createStubService();
    const document = createMediaRouter({ service }).getOpenAPIDocument({
      openapi: "3.1.0",
      info: { title: "Media test", version: "1.0.0" },
    });
    const paths = Object.keys(document.paths);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/assets",
        "/assets/upload-intent",
        "/assets/finalize",
        "/assets/{id}",
        "/assets/{id}/usage",
        "/assets/{id}/usage/{usageId}",
      ])
    );
  });
});
