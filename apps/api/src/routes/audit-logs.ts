import { Hono } from "hono";
import { z } from "zod";
import { prisma } from "@suite/db";
import { ValidationError } from "@suite/core/errors";

export const auditLogsRouter = new Hono();

const queryAuditLogsSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  appId: z.string().optional(),
  action: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/v1/audit-logs
 * Retrieves partitioned, cryptographically chained audit events for a tenant.
 */
auditLogsRouter.get("/", async (c) => {
  const query = c.req.query();
  const parseResult = queryAuditLogsSchema.safeParse(query);

  if (!parseResult.success) {
    throw new ValidationError(
      "Invalid audit logs query parameters",
      parseResult.error.errors.map((e) => ({
        name: e.path.join("."),
        reason: e.message,
      }))
    );
  }

  const { organizationId, appId, action, entityType, entityId, page, limit } = parseResult.data;
  const skip = (page - 1) * limit;

  const where = {
    organizationId,
    ...(appId ? { appId } : {}),
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { timestamp: "desc" },
    }),
  ]);

  return c.json({
    success: true,
    data: items,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + items.length < total,
    },
    requestId: c.get("requestId") || "req_unknown",
    timestamp: new Date().toISOString(),
  });
});
