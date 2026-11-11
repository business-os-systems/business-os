import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import {
  PLATFORM_ERROR_CODE,
  PERMISSIONS,
  createSuccessResponseBody,
  createSuccessResponseSchema,
  hasPermission,
  problemDetailsSchema,
} from "@suite/core";
import {
  ForbiddenError,
  InternalServerError,
  UnauthorizedError,
} from "@suite/core/errors";
import {
  MEDIA_LIMITS,
  createMediaService,
  createS3StorageAdapter,
  finalizeUploadSchema,
  listAssetsQuerySchema,
  readMediaConfig,
  registerUsageSchema,
  uploadIntentSchema,
  type MediaActor,
  type MediaService,
} from "@suite/media";
import { requireAuth } from "../middleware/auth.js";
import { platformValidationHook } from "./admin/openapi-shared.js";

const MEDIA_TAG = "Shared Media Library";

const usageSchema = z
  .object({
    id: z.string(),
    assetId: z.string(),
    appId: z.string(),
    resourceType: z.string(),
    resourceId: z.string(),
    subKey: z.string(),
    status: z.enum(["DRAFT", "PUBLISHED"]),
    createdAt: z.string().datetime(),
  })
  .strict();

const assetSchema = z
  .object({
    id: z.string(),
    kind: z.enum(["IMAGE"]),
    fileName: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int(),
    checksum: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    url: z.string().url(),
    status: z.enum(["ACTIVE", "ARCHIVED"]),
    usageCount: z.number().int(),
    createdAt: z.string().datetime(),
  })
  .strict();

const assetDetailSchema = assetSchema.extend({
  usages: z.array(usageSchema),
});

const assetPageSchema = z
  .object({
    items: z.array(assetSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

const uploadIntentViewSchema = z
  .object({
    uploadUrl: z.string().url(),
    storageKey: z.string(),
    expiresAt: z.string().datetime(),
    maxBytes: z.number().int(),
    allowedTypes: z.array(z.string()),
    requiredHeaders: z.record(z.string()),
  })
  .strict();

const finalizeViewSchema = z
  .object({
    assetId: z.string(),
    url: z.string().url(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    checksum: z.string(),
    storageBytes: z.number().int(),
    duplicate: z.boolean(),
  })
  .strict();

const deleteViewSchema = z
  .object({ assetId: z.string(), deleted: z.literal(true) })
  .strict();

const removeUsageViewSchema = z
  .object({ usageId: z.string(), removed: z.literal(true) })
  .strict();

const idParamsSchema = z.object({
  id: z.string().min(1).max(MEDIA_LIMITS.MAX_ID_LENGTH),
});
const usageParamsSchema = z.object({
  id: z.string().min(1).max(MEDIA_LIMITS.MAX_ID_LENGTH),
  usageId: z.string().min(1).max(MEDIA_LIMITS.MAX_ID_LENGTH),
});

const envelope = <T extends z.ZodTypeAny>(data: T) =>
  createSuccessResponseSchema(data);

const mediaErrors = {
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  403: {
    description: "Media capability denied",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  404: {
    description: "Asset or usage not found",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  409: {
    description:
      "Asset still referenced by published content, or the storage allowance is exhausted",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  413: {
    description: "Upload exceeds the declared size limit",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  422: {
    description: "Invalid request or unresolvable upload",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const listRoute = createRoute({
  method: "get",
  path: "/assets",
  tags: [MEDIA_TAG],
  summary: "List workspace media assets",
  description:
    "Cursor-paginated assets for the verified workspace. type filters the asset kind, search matches the display name, and unused=true returns assets with no usage rows so they can be cleaned up (FR-051, FR-052).",
  request: { query: listAssetsQuerySchema },
  responses: {
    200: {
      description: "One page of media assets",
      content: { "application/json": { schema: envelope(assetPageSchema) } },
    },
    ...mediaErrors,
  },
});

const intentRoute = createRoute({
  method: "post",
  path: "/assets/upload-intent",
  tags: [MEDIA_TAG],
  summary: "Request a presigned direct upload",
  description:
    "Validates the declared type, size and SHA-256 checksum, then returns a signed upload URL, the server-owned storage key and the headers the client must send. Bytes never pass through the API.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: uploadIntentSchema } },
    },
  },
  responses: {
    200: {
      description: "Presigned upload intent",
      content: {
        "application/json": { schema: envelope(uploadIntentViewSchema) },
      },
    },
    ...mediaErrors,
  },
});

const finalizeRoute = createRoute({
  method: "post",
  path: "/assets/finalize",
  tags: [MEDIA_TAG],
  summary: "Verify and register an uploaded object",
  description:
    "Re-checks the stored object's type, size and provider-verified checksum. An identical checksum returns the existing asset (duplicate=true) and charges storage once. A failed check discards the object before any row exists.",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: finalizeUploadSchema } },
    },
  },
  responses: {
    200: {
      description: "Registered asset (new or deduplicated)",
      content: { "application/json": { schema: envelope(finalizeViewSchema) } },
    },
    ...mediaErrors,
  },
});

const getAssetRoute = createRoute({
  method: "get",
  path: "/assets/{id}",
  tags: [MEDIA_TAG],
  summary: "Read an asset with every usage",
  description:
    "Returns the asset plus every application reference by identity, including DRAFT and PUBLISHED status.",
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: "Asset detail",
      content: { "application/json": { schema: envelope(assetDetailSchema) } },
    },
    ...mediaErrors,
  },
});

const deleteAssetRoute = createRoute({
  method: "delete",
  path: "/assets/{id}",
  tags: [MEDIA_TAG],
  summary: "Delete an unused asset",
  description:
    "Deletes the asset and its DRAFT usages. A PUBLISHED usage refuses the delete with 409 and the referencing locations (FR-121).",
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: "Asset deleted",
      content: { "application/json": { schema: envelope(deleteViewSchema) } },
    },
    ...mediaErrors,
  },
});

const registerUsageRoute = createRoute({
  method: "post",
  path: "/assets/{id}/usage",
  tags: [MEDIA_TAG],
  summary: "Register an application reference",
  description:
    "Records that an application resource references the asset by identity. The composite unique key makes replay idempotent (FR-120).",
  request: {
    params: idParamsSchema,
    body: {
      required: true,
      content: { "application/json": { schema: registerUsageSchema } },
    },
  },
  responses: {
    200: {
      description: "Stored usage",
      content: { "application/json": { schema: envelope(usageSchema) } },
    },
    ...mediaErrors,
  },
});

const removeUsageRoute = createRoute({
  method: "delete",
  path: "/assets/{id}/usage/{usageId}",
  tags: [MEDIA_TAG],
  summary: "Remove an application reference",
  description:
    "Removes a usage when the referencing content changes, which releases the asset for deletion.",
  request: { params: usageParamsSchema },
  responses: {
    200: {
      description: "Usage removed",
      content: {
        "application/json": { schema: envelope(removeUsageViewSchema) },
      },
    },
    ...mediaErrors,
  },
});

const sessionClaimsSchema = z.object({
  permissions: z.array(z.string()).optional(),
});

/** Structural read of the verified Hono context; route generics stay inferred. */
interface MediaRequestContext {
  get(key: string): unknown;
}

function readPermissions(c: MediaRequestContext): readonly string[] {
  const parsed = sessionClaimsSchema.safeParse(c.get("user"));
  return parsed.success ? (parsed.data.permissions ?? []) : [];
}

/** Fail-closed capability gate: a missing permission context denies. */
function requireMediaCapability(capability: string): MiddlewareHandler {
  return async (c, next) => {
    if (!hasPermission(readPermissions(c), capability)) {
      throw new ForbiddenError(
        `This action requires the ${capability} capability.`,
        { code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED }
      );
    }
    await next();
  };
}

function readMediaActor(c: MediaRequestContext): MediaActor {
  const organizationId: unknown = c.get("organizationId");
  const userId: unknown = c.get("userId");
  if (
    typeof organizationId !== "string" ||
    organizationId.length === 0 ||
    typeof userId !== "string" ||
    userId.length === 0
  ) {
    throw new UnauthorizedError(
      "An authenticated user with an active workspace is required.",
      { code: PLATFORM_ERROR_CODE.AUTH_REQUIRED }
    );
  }
  return { organizationId, userId };
}

function readRequestId(c: MediaRequestContext): string {
  const requestId: unknown = c.get("requestId");
  if (typeof requestId !== "string" || requestId.length === 0) {
    throw new InternalServerError("The request id middleware did not run.");
  }
  return requestId;
}

export interface MediaRouterOptions {
  /** Injected by contract tests; production resolves the S3 adapter lazily. */
  readonly service?: MediaService;
}

function createLazyMediaService(): () => MediaService {
  let cached: MediaService | undefined;
  return () => {
    if (cached === undefined) {
      const config = readMediaConfig();
      cached = createMediaService({
        storage: createS3StorageAdapter(config),
        config,
      });
    }
    return cached;
  };
}

function resolveServiceFactory(options: MediaRouterOptions): () => MediaService {
  if (options.service !== undefined) {
    const injected = options.service;
    return () => injected;
  }
  return createLazyMediaService();
}

interface MediaGuards {
  readonly read: MiddlewareHandler;
  readonly upload: MiddlewareHandler;
  readonly remove: MiddlewareHandler;
}

interface MediaRouteRegistration {
  readonly router: OpenAPIHono;
  readonly resolveService: () => MediaService;
  readonly guards: MediaGuards;
}

function registerListRoute(registration: MediaRouteRegistration): void {
  registration.router.openapi(
    { ...listRoute, middleware: [registration.guards.read] },
    async (c) => {
      const data = await registration.resolveService().listAssets(
        readMediaActor(c),
        c.req.valid("query")
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
}

function registerIntentRoute(registration: MediaRouteRegistration): void {
  registration.router.openapi(
    { ...intentRoute, middleware: [registration.guards.upload] },
    async (c) => {
      const data = await registration.resolveService().createUploadIntent(
        readMediaActor(c),
        c.req.valid("json")
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
}

function registerFinalizeRoute(registration: MediaRouteRegistration): void {
  registration.router.openapi(
    { ...finalizeRoute, middleware: [registration.guards.upload] },
    async (c) => {
      const data = await registration.resolveService().finalizeUpload(
        readMediaActor(c),
        c.req.valid("json")
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
}

function registerAssetRoutes(registration: MediaRouteRegistration): void {
  registration.router.openapi(
    { ...getAssetRoute, middleware: [registration.guards.read] },
    async (c) => {
      const data = await registration.resolveService().getAsset(
        readMediaActor(c),
        c.req.valid("param").id
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
  registration.router.openapi(
    { ...deleteAssetRoute, middleware: [registration.guards.remove] },
    async (c) => {
      const data = await registration.resolveService().deleteAsset(
        readMediaActor(c),
        c.req.valid("param").id
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
}

function registerUsageRoutes(registration: MediaRouteRegistration): void {
  registration.router.openapi(
    { ...registerUsageRoute, middleware: [registration.guards.upload] },
    async (c) => {
      const data = await registration.resolveService().registerUsage(
        readMediaActor(c),
        c.req.valid("param").id,
        c.req.valid("json")
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
  registration.router.openapi(
    { ...removeUsageRoute, middleware: [registration.guards.upload] },
    async (c) => {
      const { id, usageId } = c.req.valid("param");
      const data = await registration.resolveService().removeUsage(
        readMediaActor(c),
        id,
        usageId
      );
      return c.json(
        createSuccessResponseBody({ data, requestId: readRequestId(c) }),
        200
      );
    }
  );
}

export function createMediaRouter(
  options: MediaRouterOptions = {}
): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: platformValidationHook });
  router.use("*", requireAuth());
  const registration: MediaRouteRegistration = {
    router,
    resolveService: resolveServiceFactory(options),
    guards: {
      read: requireMediaCapability(PERMISSIONS.MEDIA.READ),
      upload: requireMediaCapability(PERMISSIONS.MEDIA.UPLOAD),
      remove: requireMediaCapability(PERMISSIONS.MEDIA.DELETE),
    },
  };
  registerListRoute(registration);
  registerIntentRoute(registration);
  registerFinalizeRoute(registration);
  registerAssetRoutes(registration);
  registerUsageRoutes(registration);
  return router;
}
