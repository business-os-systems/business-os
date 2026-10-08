import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@suite/db";
import { NotFoundError, ValidationError } from "@suite/core/errors";

export const branchesRouter = new Hono();

const createBranchSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  name: z.string().min(2).max(191),
  code: z.string().min(2).max(32).regex(/^[A-Z0-9_-]+$/, "Code must be uppercase alphanumeric with dashes/underscores"),
  type: z.string().min(2).max(64),
  timezone: z.string().default("Asia/Kolkata"),
  nightAuditHour: z.number().int().min(0).max(23).default(4),
  currency: z.string().length(3).default("INR"),
  locale: z.string().max(10).default("en"),
  dateFormat: z.string().max(20).default("YYYY-MM-DD"),
  timeFormat: z.string().max(5).default("12h"),
  taxIdentifier: z.string().max(64).optional(),
  parentBranchId: z.string().optional(),
});

const updateBranchSchema = createBranchSchema.partial().omit({ organizationId: true });

/**
 * GET /api/v1/branches
 * Lists operational branches filtered by organizationId.
 */
branchesRouter.get("/", async (c) => {
  const orgId = c.req.query("organizationId") || c.req.header("x-organization-id");

  const branches = await prisma.branch.findMany({
    where: orgId ? { organizationId: orgId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });

  return c.json({
    success: true,
    data: branches,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/branches/:id
 * Fetches branch by ID.
 */
branchesRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const branch = await prisma.branch.findUnique({
    where: { id },
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

  return c.json({
    success: true,
    data: branch,
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/v1/branches
 * Creates a new branch operational unit.
 */
branchesRouter.post("/", async (c) => {
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = createBranchSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid branch creation payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const branch = await prisma.branch.create({
    data: parseResult.data,
  });

  return c.json(
    {
      success: true,
      data: branch,
      requestId: c.get("requestId") || "req_unknown",
      timestamp: new Date().toISOString(),
    },
    201
  );
});

/**
 * PATCH /api/v1/branches/:id
 * Updates branch details.
 */
branchesRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const rawBody = await c.req.json().catch(() => ({}));
  const parseResult = updateBranchSchema.safeParse(rawBody);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid branch update payload",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const existing = await prisma.branch.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundError(`Branch [${id}] not found`, {
      code: "BRANCH_NOT_FOUND",
    });
  }

  const updated = await prisma.branch.update({
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
