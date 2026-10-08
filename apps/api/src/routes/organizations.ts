import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { prisma } from "@suite/db";
import { NotFoundError, ValidationError } from "@suite/core/errors";

export const organizationsRouter = new OpenAPIHono({
  defaultHook: (result, _c) => {
    if (!result.success) {
      throw new ValidationError(
        "Invalid request parameters",
        result.error.errors.map((e) => ({
          name: e.path.join("."),
          reason: e.message,
        }))
      );
    }
  },
});

const createOrgSchema = z.object({
  name: z.string().min(2).max(191),
  slug: z.string().min(2).max(191).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  currency: z.string().length(3).default("INR"),
  country: z.string().length(2).default("IN"),
  defaultLocale: z.string().max(10).default("en"),
  jurisdiction: z.string().max(50).default("IN_DEFAULT"),
  customDomain: z.string().max(191).optional(),
});

const OrganizationResponseSchema = z.object({
  id: z.string().openapi({ example: "org_cm123xyz" }),
  name: z.string().openapi({ example: "Acme Hospitality Corp" }),
  slug: z.string().openapi({ example: "acme-hospitality" }),
  currency: z.string().openapi({ example: "INR" }),
  country: z.string().openapi({ example: "IN" }),
  defaultLocale: z.string().openapi({ example: "en" }),
  jurisdiction: z.string().openapi({ example: "IN_DEFAULT" }),
  customDomain: z.string().nullable().optional().openapi({ example: "hospitality.acme.com" }),
  createdAt: z.date().or(z.string()).openapi({ example: "2026-10-08T12:00:00.000Z" }),
  updatedAt: z.date().or(z.string()).openapi({ example: "2026-10-08T12:00:00.000Z" }),
  branches: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        code: z.string(),
        type: z.string(),
        status: z.string(),
      })
    )
    .optional(),
});

const listOrganizationsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(OrganizationResponseSchema),
  requestId: z.string().openapi({ example: "req_01924823" }),
  timestamp: z.string().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const getOrganizationResponseSchema = z.object({
  success: z.literal(true),
  data: OrganizationResponseSchema,
  requestId: z.string().openapi({ example: "req_01924823" }),
  timestamp: z.string().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

const problemDetailsResponseSchema = z.object({
  type: z.string().openapi({ example: "https://errors.business-os.com/errors/not-found" }),
  title: z.string().openapi({ example: "Not Found" }),
  status: z.number().openapi({ example: 404 }),
  detail: z.string().openapi({ example: "Organization [org_123] not found" }),
  instance: z.string().openapi({ example: "/api/v1/organizations/org_123" }),
  code: z.string().openapi({ example: "ORGANIZATION_NOT_FOUND" }),
  requestId: z.string().openapi({ example: "req_abc123" }),
  timestamp: z.string().openapi({ example: "2026-10-08T12:00:00.000Z" }),
});

export const listOrganizationsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Organizations & Tenancy"],
  summary: "List all organizations",
  description: "Fetches a high-level list of registered tenant organizations and their primary branches.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: listOrganizationsResponseSchema,
        },
      },
      description: "List of organizations successfully retrieved.",
    },
  },
});

export const createOrganizationRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["Organizations & Tenancy"],
  summary: "Create a new organization",
  description: "Provisions a new root tenant organization.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: createOrgSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: getOrganizationResponseSchema,
        },
      },
      description: "Organization successfully created.",
    },
    422: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Validation error on payload.",
    },
  },
});

export const getOrganizationRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["Organizations & Tenancy"],
  summary: "Get organization by ID",
  description: "Fetches detailed organizational records, operational branches, and statutory tax profile.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "Unique Organization ID", example: "org_cm123xyz" }),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: getOrganizationResponseSchema,
        },
      },
      description: "Organization details found.",
    },
    404: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Organization ID not found.",
    },
  },
});

organizationsRouter.openapi(listOrganizationsRoute, async (c) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      branches: {
        select: { id: true, name: true, code: true, type: true, status: true },
      },
    },
  });

  return c.json(
    {
      success: true as const,
      data: orgs,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    200
  );
});

organizationsRouter.openapi(createOrganizationRoute, async (c) => {
  const body = c.req.valid("json");

  const org = await prisma.organization.create({
    data: {
      name: body.name,
      slug: body.slug,
      currency: body.currency,
      country: body.country,
      defaultLocale: body.defaultLocale,
      jurisdiction: body.jurisdiction,
      customDomain: body.customDomain,
    },
  });

  return c.json(
    {
      success: true as const,
      data: org,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    201
  );
});

organizationsRouter.openapi(getOrganizationRoute, async (c) => {
  const { id } = c.req.valid("param");

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      branches: true,
      taxProfile: true,
    },
  });

  if (!org) {
    throw new NotFoundError(`Organization [${id}] not found`, {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  return c.json(
    {
      success: true as const,
      data: org,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    200
  );
});
