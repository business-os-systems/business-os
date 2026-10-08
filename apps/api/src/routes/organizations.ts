import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@suite/db";
import { NotFoundError, ValidationError } from "@suite/core/errors";

export const organizationsRouter = new Hono();

const createOrgSchema = z.object({
  name: z.string().min(2).max(191),
  slug: z.string().min(2).max(191).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  currency: z.string().length(3).default("INR"),
  country: z.string().length(2).default("IN"),
  defaultLocale: z.string().max(10).default("en"),
  jurisdiction: z.string().max(50).default("IN_DEFAULT"),
  customDomain: z.string().max(191).optional(),
});

const updateOrgSchema = createOrgSchema.partial();

/**
 * GET /api/v1/organizations
 * Lists all active organizations.
 */
organizationsRouter.get("/", async (c) => {
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      branches: {
        select: { id: true, name: true, code: true, type: true, status: true },
      },
    },
  });

  return c.json({
    success: true,
    data: orgs,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/organizations/:id
 * Fetches organization by ID.
 */
organizationsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

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

  return c.json({
    success: true,
    data: org,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/organizations
 * Creates a new organization root.
 */
organizationsRouter.post("/", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = createOrgSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid organization payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const org = await prisma.organization.create({
    data: {
      name: parseResult.data.name,
      slug: parseResult.data.slug,
      currency: parseResult.data.currency,
      country: parseResult.data.country,
      defaultLocale: parseResult.data.defaultLocale,
      jurisdiction: parseResult.data.jurisdiction,
      customDomain: parseResult.data.customDomain,
    },
  });

  return c.json(
    {
      success: true,
      data: org,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    201
  );
});

/**
 * PATCH /api/v1/organizations/:id
 * Updates organization details.
 */
organizationsRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = updateOrgSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid organization update payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const existing = await prisma.organization.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError(`Organization [${id}] not found`, {
      code: "ORGANIZATION_NOT_FOUND",
    });
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: parseResult.data,
  });

  return c.json({
    success: true,
    data: updated,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});
