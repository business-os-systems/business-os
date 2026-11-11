import { expect, it } from "vitest";
import {
  MediaApiError,
  createMediaApiClient,
  type MediaAssetView,
  type MediaUsageView,
} from "../src/react/index.js";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";
const CHECKSUM_HELLO =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

const ASSET: MediaAssetView = {
  id: "asset-1",
  kind: "IMAGE",
  fileName: "logo.png",
  mimeType: "image/png",
  sizeBytes: 2048,
  checksum: CHECKSUM_HELLO,
  width: 320,
  height: 180,
  url: "https://cdn.example.com/media/logo.png",
  status: "ACTIVE",
  usageCount: 2,
  createdAt: TIMESTAMP,
};

const USAGE: MediaUsageView = {
  id: "usage-1",
  assetId: ASSET.id,
  appId: "website-builder",
  resourceType: "page",
  resourceId: "home",
  subKey: "hero",
  status: "PUBLISHED",
  createdAt: TIMESTAMP,
};

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;
type FetchInput = Parameters<typeof fetch>[0];

interface FetchCall {
  readonly url: string;
  readonly init: FetchInit | undefined;
}

function toUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function createFetch(handler: typeof fetch) {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = toUrl(input);
    calls.push({ url, init: init as FetchInit | undefined });
    return handler(input, init);
  };
  return { fetchImpl, calls };
}

function jsonResponse(
  body: unknown,
  status = 200,
  contentType = "application/json"
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": contentType },
  });
}

function envelope(data: unknown) {
  return {
    success: true,
    data,
    requestId: "req-media",
    timestamp: TIMESTAMP,
  };
}

function readBody(init: FetchInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    throw new Error("Expected a JSON request body.");
  }
  return JSON.parse(init.body) as unknown;
}

  it("lists assets with the exact filters the operator chose", async () => {
    const { fetchImpl, calls } = createFetch(async () =>
      jsonResponse(
        envelope({ items: [ASSET], nextCursor: null })
      )
    );
    const client = createMediaApiClient({
      baseUrl: "https://api.example.com/",
      fetchImpl,
    });

    const page = await client.listAssets({
      search: "logo",
      type: "IMAGE",
      unused: true,
      limit: 24,
      cursor: "asset-9",
    });

    expect(page.items).toEqual([ASSET]);
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/api/v1/media/assets");
    expect(url.searchParams.get("search")).toBe("logo");
    expect(url.searchParams.get("type")).toBe("IMAGE");
    expect(url.searchParams.get("unused")).toBe("true");
    expect(url.searchParams.get("limit")).toBe("24");
    expect(url.searchParams.get("cursor")).toBe("asset-9");
  });

  it("returns the asset detail with every usage location", async () => {
    const { fetchImpl } = createFetch(async () =>
      jsonResponse(envelope({ ...ASSET, usages: [USAGE] }))
    );
    const client = createMediaApiClient({ fetchImpl });

    const detail = await client.getAsset("asset-1");

    expect(detail.usages).toEqual([USAGE]);
  });

  it("surfaces a deletion refusal with the API reference list intact", async () => {
    const problem = {
      type: "/errors/media-in-use",
      title: "Media Asset Is In Use",
      status: 409,
      detail: "This asset is referenced by published content.",
      code: "MEDIA_IN_USE",
      invalidParams: [
        { name: "website-builder:page", reason: "home#hero" },
      ],
      timestamp: TIMESTAMP,
    };
    const { fetchImpl } = createFetch(async () =>
      jsonResponse(problem, 409, "application/problem+json")
    );
    const client = createMediaApiClient({ fetchImpl });

    const error = await client.deleteAsset("asset-1").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MediaApiError);
    const refusal = error as MediaApiError;
    expect(refusal.status).toBe(409);
    expect(refusal.code).toBe("MEDIA_IN_USE");
    expect(refusal.detail).toBe(problem.detail);
    expect(refusal.invalidParams).toEqual([
      { name: "website-builder:page", reason: "home#hero" },
    ]);
  });

  it("uploads through intent, direct PUT and finalize without proxying bytes", async () => {
    const intent = {
      uploadUrl: "https://storage.example.com/presigned",
      storageKey: "media/org/2026/01/asset.png",
      expiresAt: TIMESTAMP,
      maxBytes: 10_000_000,
      allowedTypes: ["image/png"],
      requiredHeaders: {
        "Content-Type": "image/png",
        "x-amz-checksum-sha256": "abc",
      },
    };
    const finalize = {
      assetId: "asset-2",
      url: ASSET.url,
      width: null,
      height: null,
      checksum: CHECKSUM_HELLO,
      storageBytes: 5,
      duplicate: false,
    };
    const { fetchImpl, calls } = createFetch(async (input) => {
      const url = toUrl(input);
      if (url.endsWith("/assets/upload-intent")) {
        return jsonResponse(envelope(intent));
      }
      if (url === intent.uploadUrl) {
        return new Response(null, { status: 200 });
      }
      return jsonResponse(envelope(finalize));
    });
    const client = createMediaApiClient({ fetchImpl });
    const file = new File(["hello"], "hello.png", { type: "image/png" });

    const result = await client.uploadAsset(file);

    expect(result.assetId).toBe("asset-2");
    expect(calls.map((call) => call.url)).toEqual([
      expect.stringContaining("/assets/upload-intent"),
      intent.uploadUrl,
      expect.stringContaining("/assets/finalize"),
    ]);
    expect(calls[1]?.init?.method).toBe("PUT");
    expect(calls[1]?.init?.body).toBe(file);
    expect(readBody(calls[0]?.init)).toEqual({
      fileName: "hello.png",
      mimeType: "image/png",
      sizeBytes: 5,
      checksum: CHECKSUM_HELLO,
    });
    expect(readBody(calls[2]?.init)).toEqual({
      storageKey: intent.storageKey,
      checksum: CHECKSUM_HELLO,
    });
  });

  it("reports a storage provider refusal transparently", async () => {
    const intent = {
      uploadUrl: "https://storage.example.com/presigned",
      storageKey: "media/org/2026/01/asset.png",
      expiresAt: TIMESTAMP,
      maxBytes: 10_000_000,
      allowedTypes: ["image/png"],
      requiredHeaders: { "Content-Type": "image/png" },
    };
    const { fetchImpl } = createFetch(async (input) => {
      const url = toUrl(input);
      if (url.endsWith("/assets/upload-intent")) {
        return jsonResponse(envelope(intent));
      }
      return new Response("Checksum mismatch at provider.", { status: 403 });
    });
    const client = createMediaApiClient({ fetchImpl });
    const file = new File(["hello"], "hello.png", { type: "image/png" });

    const error = await client.uploadAsset(file).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MediaApiError);
    expect((error as MediaApiError).status).toBe(403);
    expect((error as MediaApiError).detail).toContain("Checksum mismatch");
  });

  it("fails loudly when the API response does not match its contract", async () => {
    const { fetchImpl } = createFetch(async () =>
      jsonResponse(envelope({ items: [{ id: 7 }], nextCursor: null }))
    );
    const client = createMediaApiClient({ fetchImpl });

    await expect(client.listAssets()).rejects.toThrow(/does not match/);
  });

  it("refuses an asset URL that is not HTTP(S)", async () => {
    const { fetchImpl } = createFetch(async () =>
      jsonResponse(
        envelope({
          items: [{ ...ASSET, url: "javascript:alert(1)" }],
          nextCursor: null,
        })
      )
    );
    const client = createMediaApiClient({ fetchImpl });

    await expect(client.listAssets()).rejects.toThrow(/does not match/);
  });
