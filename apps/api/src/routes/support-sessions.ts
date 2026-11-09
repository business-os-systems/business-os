import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { Context, MiddlewareHandler } from "hono";
import {
  createSuccessResponseBody,
  hasPermission,
  PERMISSIONS,
  PLATFORM_ERROR_CODE,
  problemDetailsSchema,
} from "@suite/core";
import { ForbiddenError, UnauthorizedError } from "@suite/core/errors";
import { requireAuth } from "../middleware/auth.js";
import { getPlatformPrismaClient } from "../lib/platform-db.js";
import {
  endImpersonation,
  findActiveForOrganization,
  listHistoryForOrganization,
  tenantActorReference,
} from "../services/admin/impersonation.service.js";
import { readRequestId } from "./admin/platform-route-shared.js";
import { envelope, platformValidationHook } from "./admin/openapi-shared.js";

const SUPPORT_SESSION_TAG = "Tenant Support Sessions";

const sessionSchema = z
  .object({
    ticketId: z.string().uuid(),
    operatorDisplayName: z.string().min(1),
    reason: z.string().min(1),
    ticketRef: z.string().min(1),
    startedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

const activeSchema = z
  .object({
    active: z.boolean(),
    session: sessionSchema.nullable(),
  })
  .strict();

const historyItemSchema = z
  .object({
    ticketId: z.string().uuid(),
    operatorDisplayName: z.string().min(1),
    reason: z.string().min(1),
    ticketRef: z.string().min(1),
    startedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    endedAt: z.string().datetime().nullable(),
    endedBy: z.string().min(1).nullable(),
  })
  .strict();

const historyPageSchema = z
  .object({
    items: z.array(historyItemSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

const endResultSchema = z
  .object({
    endedAt: z.string().datetime(),
    endedBy: z.string().min(1),
  })
  .strict();

const historyQuerySchema = z.object({
  cursor: z.string().trim().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const ticketParamsSchema = z.object({
  ticketId: z.string().uuid(),
});

const supportSessionErrors = {
  401: {
    description: "Authentication required",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  403: {
    description: "Capability denied",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  404: {
    description: "Support session not found for this workspace",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  409: {
    description: "Support session already ended",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
  422: {
    description: "Invalid request",
    content: { "application/problem+json": { schema: problemDetailsSchema } },
  },
} as const;

const activeRoute = createRoute({
  method: "get",
  path: "/active",
  tags: [SUPPORT_SESSION_TAG],
  summary: "Read the active support session for this workspace",
  description:
    "Returns the most recent active support session for the authenticated workspace. The organization always comes from the verified tenant session, never from a query parameter (FR-048, FR-049).",
  responses: {
    200: {
      description: "Active support session",
      content: { "application/json": { schema: envelope(activeSchema) } },
    },
    ...supportSessionErrors,
  },
});

const historyRoute = createRoute({
  method: "get",
  path: "/history",
  tags: [SUPPORT_SESSION_TAG],
  summary: "List this workspace's support-session history",
  description:
    "Cursor-paginated support-session history scoped to the authenticated workspace, ordered by startedAt DESC, id DESC with a hard limit of 50 (FR-049, CT-5). The read is a deliberate org-scoped curated read through the platform identity because app_tenant has no grant on the platform schema.",
  request: { query: historyQuerySchema },
  responses: {
    200: {
      description: "Support-session history",
      content: {
        "application/json": { schema: envelope(historyPageSchema) },
      },
    },
    ...supportSessionErrors,
  },
});

const endRoute = createRoute({
  method: "delete",
  path: "/{ticketId}",
  tags: [SUPPORT_SESSION_TAG],
  summary: "End a support session affecting this workspace",
  description:
    "A tenant administrator holding core:organization:update ends a support session scoped to their own workspace. A ticket belonging to another workspace is reported as not found; IMPERSONATION_ENDED is written in the same transaction with endedBy tenant:<userId> (FR-047).",
  request: { params: ticketParamsSchema },
  responses: {
    200: {
      description: "Support session ended",
      content: { "application/json": { schema: envelope(endResultSchema) } },
    },
    ...supportSessionErrors,
  },
});

interface TenantActor {
  readonly organizationId: string;
  readonly userId: string;
}

/**
 * The verified session supplies both the workspace and the actor. Fail closed:
 * a session missing either cannot read or terminate a support session.
 */
function readTenantActor(c: Context): TenantActor {
  const organizationId: unknown = c.get("organizationId");
  const userId: unknown = c.get("userId");
  if (
    typeof organizationId !== "string" ||
    organizationId.length === 0 ||
    typeof userId !== "string" ||
    userId.length === 0
  ) {
    throw new UnauthorizedError(
      "An active workspace and an authenticated user are required.",
      { code: PLATFORM_ERROR_CODE.AUTH_REQUIRED }
    );
  }
  return { organizationId, userId };
}

const sessionClaimsSchema = z.object({
  permissions: z.array(z.string()).optional(),
});

function readPermissions(c: Context): readonly string[] {
  const parsed = sessionClaimsSchema.safeParse(c.get("user"));
  return parsed.success ? (parsed.data.permissions ?? []) : [];
}

/** Fail-closed: a missing permission context denies the termination. */
const organizationUpdateGuard: MiddlewareHandler = async (c, next) => {
  if (
    !hasPermission(readPermissions(c), PERMISSIONS.CORE.ORGANIZATION_UPDATE)
  ) {
    throw new ForbiddenError(
      "Ending a support session requires the organization update permission.",
      { code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED }
    );
  }
  await next();
};

export const supportSessionsRouter = new OpenAPIHono({
  defaultHook: platformValidationHook,
});

supportSessionsRouter.use("*", requireAuth());

supportSessionsRouter.openapi(activeRoute, async (c) => {
  const { organizationId } = readTenantActor(c);
  const session = await findActiveForOrganization(
    getPlatformPrismaClient(),
    organizationId
  );
  return c.json(
    createSuccessResponseBody({
      data: { active: session !== null, session },
      requestId: readRequestId(c),
    }),
    200,
    { "Cache-Control": "no-store" }
  );
});

supportSessionsRouter.openapi(historyRoute, async (c) => {
  const { organizationId } = readTenantActor(c);
  const query = c.req.valid("query");
  const data = await listHistoryForOrganization(getPlatformPrismaClient(), {
    organizationId,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    limit: query.limit,
  });
  return c.json(
    createSuccessResponseBody({ data, requestId: readRequestId(c) }),
    200,
    { "Cache-Control": "no-store" }
  );
});

supportSessionsRouter.openapi(
  { ...endRoute, middleware: organizationUpdateGuard },
  async (c) => {
    const { organizationId, userId } = readTenantActor(c);
    const requestId = readRequestId(c);
    const { ticketId } = c.req.valid("param");
    const data = await endImpersonation(getPlatformPrismaClient(), {
      ticketId,
      scope: { kind: "tenant", organizationId },
      endedBy: tenantActorReference(userId),
      actorOperatorId: null,
      requestId,
    });
    return c.json(
      createSuccessResponseBody({ data, requestId }),
      200
    );
  }
);
