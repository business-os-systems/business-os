import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "@suite/db";
import { NotFoundError, ValidationError } from "@suite/core/errors";

export const branchesRouter = new OpenAPIHono();

const BranchResponseSchema = z.object({
  id: z.string().openapi({ example: "br_cm123xyz" }),
  organizationId: z.string().openapi({ example: "org_cm123xyz" }),
  name: z.string().openapi({ example: "Riverview Homestay Main" }),
  code: z.string().openapi({ example: "RVM-01" }),
  type: z.string().openapi({ example: "HOSPITALITY_LODGING" }),
  timezone: z.string().openapi({ example: "Asia/Kolkata" }),
  nightAuditHour: z.number().openapi({ example: 4 }),
  currency: z.string().openapi({ example: "INR" }),
  locale: z.string().openapi({ example: "en" }),
  status: z.string().openapi({ example: "ACTIVE" }),
  parentBranchId: z.string().nullable().optional(),
  createdAt: z.date().or(z.string()).openapi({ example: "2026-10-08T12:00:00.000Z" }),
  updatedAt: z.date().or(z.string()).openapi({ example: "2026-10-08T12:00:00.000Z" }),
  organization: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .optional(),
});

const listBranchesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(BranchResponseSchema),
  requestId: z.string().openapi({ example: "req_01924823" }),
  timestamp: z.string().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const getBranchResponseSchema = z.object({
  success: z.literal(true),
  data: BranchResponseSchema,
  requestId: z.string().openapi({ example: "req_01924823" }),
  timestamp: z.string().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const problemDetailsResponseSchema = z.object({
  type: z.string().openapi({ example: "about:blank" }),
  title: z.string().openapi({ example: "Not Found" }),
  status: z.number().openapi({ example: 404 }),
  detail: z.string().openapi({ example: "Branch [br_123] not found" }),
  instance: z.string().openapi({ example: "/api/v1/branches/br_123" }),
  code: z.string().openapi({ example: "BRANCH_NOT_FOUND" }),
  requestId: z.string().openapi({ example: "req_abc123" }),
  timestamp: z.string().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

export const listBranchesRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Operational Branches & Hierarchy"],
  summary: "List operational branches",
  description: "Lists operational physical branches (properties, stores, cafes) filtered by organization ID.",
  request: {
    query: z.object({
      organizationId: z.string().optional().openapi({ description: "Filter branches by Organization ID", example: "org_cm123xyz" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: listBranchesResponseSchema,
        },
      },
      description: "Branches successfully retrieved.",
    },
  },
});

export const getBranchRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Operational Branches & Hierarchy"],
  summary: "Get branch by ID",
  description: "Fetches single branch details including parent/sub-branch hierarchy, address, and local timezone/4 AM turnover settings.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Unique Branch ID", example: "br_cm123xyz" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: getBranchResponseSchema,
        },
      },
      description: "Branch details found.",
    },
    404: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Branch not found.",
    },
  },
});

branchesRouter.openapi(listBranchesRoute, async (c) => {
  const { organizationId } = c.req.valid("query");
  const orgId = organizationId || c.req.header("x-organization-id");

  if (!orgId) {
    throw new ValidationError("Tenant context is required to query branches", [
      {
        name: "organizationId",
        reason: "An explicit organizationId query parameter or x-organization-id header is required for tenant isolation.",
      },
    ]);
  }

  const branches = await prisma.branch.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return c.json(
    {
      success: true as const,
      data: branches,
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
    200
  );
});

branchesRouter.openapi(getBranchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const orgId = c.req.header("x-organization-id");

  const branch = await prisma.branch.findFirst({
    where: orgId ? { id, organizationId: orgId } : { id },
    include: {
      organization: true,
      subBranches: true,
      address: true,
    },
  });

  if (!branch) {
    throw new NotFoundError(`Branch [${id}] not found`, {
      code: "BRANCH_NOT_FOUND",
    });
  }

  return c.json(
    {
      success: true as const,
      data: branch,
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
    200
  );
});
