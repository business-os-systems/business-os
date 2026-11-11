import { z } from "zod";
import {
  createSuccessResponseSchema,
  problemDetailsSchema,
  type ProblemDetailsResponse,
} from "@suite/core";
import {
  MEDIA_ASSET_KINDS,
  MEDIA_ASSET_STATUSES,
  MEDIA_LIMITS,
  MEDIA_USAGE_STATUSES,
} from "../constants.js";

type MediaAssetKind = (typeof MEDIA_ASSET_KINDS)[number];
import type {
  DeleteAssetView,
  FinalizeUploadView,
  MediaAssetDetail,
  MediaAssetPage,
  MediaUsageView,
} from "../contracts.js";

/** Base path of the shared media API. Apps pass their own origin. */
export const MEDIA_API_BASE_PATH = "/api/v1/media";

const MAX_UPLOAD_ERROR_DETAIL_LENGTH = 500;

/** Asset and presigned upload URLs are served over HTTP(S) only. */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const mediaUrlSchema = z
  .string()
  .url()
  .refine(isHttpUrl, "Media URLs must use the http or https scheme.");


export interface MediaListQuery {
  readonly cursor?: string;
  readonly type?: MediaAssetKind;
  readonly search?: string;
  readonly unused?: boolean;
  readonly limit?: number;
}

export interface MediaImageDimensions {
  readonly width: number | null;
  readonly height: number | null;
}

/**
 * Transport-agnostic port every application uses to open the shared picker.
 * It carries no app identifiers: the API scopes the request by the verified
 * workspace session.
 */
export interface MediaClient {
  listAssets(query?: MediaListQuery): Promise<MediaAssetPage>;
  getAsset(assetId: string): Promise<MediaAssetDetail>;
  deleteAsset(assetId: string): Promise<DeleteAssetView>;
  uploadAsset(file: File): Promise<FinalizeUploadView>;
}

export interface MediaProblemInvalidParam {
  readonly name: string;
  readonly reason: string;
}

export interface MediaApiErrorOptions {
  readonly status: number;
  readonly code: string | null;
  readonly title: string | null;
  readonly detail: string;
  readonly invalidParams: readonly MediaProblemInvalidParam[];
}

/** RFC 7807 failure that keeps the API's detail and references intact. */
export class MediaApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly title: string | null;
  readonly detail: string;
  readonly invalidParams: readonly MediaProblemInvalidParam[];

  constructor(options: MediaApiErrorOptions) {
    super(options.detail);
    this.name = "MediaApiError";
    this.status = options.status;
    this.code = options.code;
    this.title = options.title;
    this.detail = options.detail;
    this.invalidParams = options.invalidParams;
  }
}

export interface MediaApiClientOptions {
  /** Same-origin by default; other apps pass their API origin. */
  readonly baseUrl?: string;
  /** Test seam; production uses the platform fetch. */
  readonly fetchImpl?: typeof fetch;
}

const assetSchema = z
  .object({
    id: z.string(),
    kind: z.enum(MEDIA_ASSET_KINDS),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    checksum: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    url: mediaUrlSchema,
    status: z.enum(MEDIA_ASSET_STATUSES),
    usageCount: z.number().int(),
    createdAt: z.string().datetime(),
  })
  .strict();

const usageSchema: z.ZodType<MediaUsageView> = z
  .object({
    id: z.string(),
    assetId: z.string(),
    appId: z.string(),
    resourceType: z.string(),
    resourceId: z.string(),
    subKey: z.string(),
    status: z.enum(MEDIA_USAGE_STATUSES),
    createdAt: z.string().datetime(),
  })
  .strict();

const assetDetailSchema: z.ZodType<MediaAssetDetail> = assetSchema.extend({
  usages: z.array(usageSchema),
});

const assetPageSchema: z.ZodType<MediaAssetPage> = z
  .object({
    items: z.array(assetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

const deleteViewSchema: z.ZodType<DeleteAssetView> = z
  .object({ assetId: z.string(), deleted: z.literal(true) })
  .strict();

const finalizeViewSchema: z.ZodType<FinalizeUploadView> = z
  .object({
    assetId: z.string(),
    url: mediaUrlSchema,
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    checksum: z.string(),
    storageBytes: z.number().int(),
    duplicate: z.boolean(),
  })
  .strict();

const assetPageEnvelopeSchema = createSuccessResponseSchema(assetPageSchema);
const assetDetailEnvelopeSchema = createSuccessResponseSchema(assetDetailSchema);
const deleteEnvelopeSchema = createSuccessResponseSchema(deleteViewSchema);
const finalizeEnvelopeSchema = createSuccessResponseSchema(finalizeViewSchema);

const uploadIntentViewSchema = z
  .object({
    uploadUrl: mediaUrlSchema,
    storageKey: z.string(),
    expiresAt: z.string().datetime(),
    maxBytes: z.number().int(),
    allowedTypes: z.array(z.string()),
    requiredHeaders: z.record(z.string()),
  })
  .strict();

type UploadIntentView = z.infer<typeof uploadIntentViewSchema>;

interface UploadIntentBody {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

function readString(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null) {
    return null;
  }
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" ? value : null;
}

function readProblem(
  status: number,
  statusText: string,
  body: unknown
): MediaApiError {
  const parsed = problemDetailsSchema.safeParse(body);
  if (parsed.success) {
    return fromProblemDetails(parsed.data);
  }
  return new MediaApiError({
    status,
    code: readString(body, "code"),
    title: readString(body, "title") ?? statusText,
    detail:
      readString(body, "detail") ??
      readString(body, "title") ??
      `The media API request failed with status ${status}.`,
    invalidParams: [],
  });
}

function fromProblemDetails(problem: ProblemDetailsResponse): MediaApiError {
  return new MediaApiError({
    status: problem.status,
    code: problem.code,
    title: problem.title,
    detail: problem.detail,
    invalidParams: (problem.invalidParams ?? []).map((param) => ({
      name: param.name,
      reason: param.reason,
    })),
  });
}

/**
 * RFC 7807 bodies arrive as `application/problem+json`, so every structured
 * JSON media type must be parsed instead of being flattened to raw text.
 */
function isJsonContentType(contentType: string): boolean {
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

async function readJsonBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!isJsonContentType(contentType)) {
    const text = await response.text();
    return text.length > 0 ? { detail: text } : null;
  }
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function buildQueryString(query: MediaListQuery): string {
  const params = new URLSearchParams();
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.type !== undefined) params.set("type", query.type);
  if (query.search !== undefined && query.search.length > 0) {
    params.set("search", query.search);
  }
  if (query.unused === true) params.set("unused", "true");
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  return params.toString();
}

function assertUploadIncomplete(message: string, status: number): never {
  throw new MediaApiError({
    status,
    code: null,
    title: "Upload Failed",
    detail: message,
    invalidParams: [],
  });
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function readImageDimensions(file: File): Promise<MediaImageDimensions> {
  if (typeof globalThis.createImageBitmap !== "function") {
    return { width: null, height: null };
  }
  try {
    const bitmap = await globalThis.createImageBitmap(file);
    try {
      return { width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch (error) {
    console.warn("Media image dimensions could not be read:", error);
    return { width: null, height: null };
  }
}

function buildUploadHeaders(intent: UploadIntentView): Record<string, string> {
  return { ...intent.requiredHeaders };
}

function buildFinalizeBody(
  intent: UploadIntentView,
  checksum: string,
  dimensions: MediaImageDimensions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    storageKey: intent.storageKey,
    checksum,
  };
  if (dimensions.width !== null) body.width = dimensions.width;
  if (dimensions.height !== null) body.height = dimensions.height;
  return body;
}

function readUploadFailureDetail(response: Response, text: string): string {
  if (text.length === 0) {
    return `The storage provider refused the upload with status ${response.status}.`;
  }
  return text.slice(0, MAX_UPLOAD_ERROR_DETAIL_LENGTH);
}

interface MediaApiTransport {
  readonly baseUrl: string;
  readonly fetchImpl: typeof fetch;
}

async function sendJson(
  transport: MediaApiTransport,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown; query?: MediaListQuery }
): Promise<unknown> {
  const queryString =
    init.query === undefined ? "" : buildQueryString(init.query);
  const suffix = queryString.length > 0 ? `?${queryString}` : "";
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await transport.fetchImpl(
    `${transport.baseUrl}${MEDIA_API_BASE_PATH}${path}${suffix}`,
    {
      method: init.method,
      headers,
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    }
  );
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw readProblem(response.status, response.statusText, body);
  }
  return body;
}

function parseEnvelope<T>(
  schema: z.ZodType<{ success: true; data: T }>,
  body: unknown
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new Error(
      "The media API returned a response that does not match its contract."
    );
  }
  return parsed.data.data;
}

async function requestUpload(
  transport: MediaApiTransport,
  file: File
): Promise<FinalizeUploadView> {
  const checksum = await sha256Hex(file);
  const dimensions = await readImageDimensions(file);
  const intentBody: UploadIntentBody = {
    fileName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    checksum,
  };
  const intent = parseEnvelope(
    createSuccessResponseSchema(uploadIntentViewSchema),
    await sendJson(transport, "/assets/upload-intent", {
      method: "POST",
      body: intentBody,
    })
  );
  const upload = await transport.fetchImpl(intent.uploadUrl, {
    method: "PUT",
    headers: buildUploadHeaders(intent),
    body: file,
  });
  if (!upload.ok) {
    const text = await upload.text();
    assertUploadIncomplete(
      readUploadFailureDetail(upload, text),
      upload.status
    );
  }
  return parseEnvelope(
    finalizeEnvelopeSchema,
    await sendJson(transport, "/assets/finalize", {
      method: "POST",
      body: buildFinalizeBody(intent, checksum, dimensions),
    })
  );
}

function normalizeBaseUrl(baseUrl: string | undefined): string {
  if (baseUrl === undefined || baseUrl.length === 0) {
    return "";
  }
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Typed HTTP implementation of MediaClient. It validates every response at
 * the boundary, so a drifted API fails loudly instead of rendering garbage.
 */
export function createMediaApiClient(
  options: MediaApiClientOptions = {}
): MediaClient {
  const transport: MediaApiTransport = {
    baseUrl: normalizeBaseUrl(options.baseUrl),
    fetchImpl:
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init)),
  };
  return {
    async listAssets(query = {}) {
      const body = await sendJson(transport, "/assets", {
        method: "GET",
        query,
      });
      return parseEnvelope(assetPageEnvelopeSchema, body);
    },
    async getAsset(assetId) {
      const body = await sendJson(
        transport,
        `/assets/${encodeURIComponent(assetId)}`,
        { method: "GET" }
      );
      return parseEnvelope(assetDetailEnvelopeSchema, body);
    },
    async deleteAsset(assetId) {
      const body = await sendJson(
        transport,
        `/assets/${encodeURIComponent(assetId)}`,
        { method: "DELETE" }
      );
      return parseEnvelope(deleteEnvelopeSchema, body);
    },
    uploadAsset(file) {
      return requestUpload(transport, file);
    },
  };
}

export const MEDIA_DEFAULT_PAGE_SIZE = MEDIA_LIMITS.DEFAULT_PAGE_SIZE;
