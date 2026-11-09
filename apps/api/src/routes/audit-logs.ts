import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { requireAuth } from "../middleware/auth.js";
import { queryAuditLogs } from "../services/audit-logs.service.js";

export const auditLogsRouter = new OpenAPIHono();

auditLogsRouter.use("*", requireAuth());

const AuditLogItemSchema = z.object({
  id: z.string().openapi({ example: "audit_123" }),
  organizationId: z.string().openapi({ example: "org_123" }),
  appId: z.string().openapi({ example: "platform.core" }),
  action: z.string().openapi({ example: "organization.created" }),
  entityType: z.string().openapi({ example: "Organization" }),
  entityId: z.string().openapi({ example: "org_123" }),
  actorUserId: z.string().nullable().optional(),
  actorRole: z.string().openapi({ example: "SYSTEM" }),
  reason: z.string().nullable().optional(),
  managerPinVerified: z.boolean(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  recordHash: z.string().openapi({ description: "Cryptographic SHA-256 integrity hash", example: "a3f5b7..." }),
  prevHash: z.string().nullable().optional(),
  timestamp: z.date().or(z.string()).openapi({ example: "2026-10-08T12:00:00.000Z" }),
  oldData: z.unknown().nullable().optional(),
  newData: z.unknown().nullable().optional(),
});

const listAuditLogsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(AuditLogItemSchema),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
  requestId: z.string(),
  timestamp: z.string(),
});

export const listAuditLogsRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Audit Logs & Security Integrity"],
  summary: "Query cryptographically chained audit events",
  description: "Retrieves partitioned, tamper-evident audit logs with SHA-256 hash chaining meeting OWASP ASVS compliance.",
  request: {
    query: z.object({
      organizationId: z.string().min(1).openapi({ description: "Target Organization ID", example: "org_123" }),
      appId: z.string().optional().openapi({ description: "Filter by App ID", example: "platform.core" }),
      action: z.string().optional().openapi({ description: "Filter by action slug", example: "organization.created" }),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: listAuditLogsResponseSchema,
        },
      },
      description: "Audit events successfully retrieved.",
    },
  },
});

auditLogsRouter.openapi(listAuditLogsRoute, async (c) => {
  const query = c.req.valid("query");
  const { items, total } = await queryAuditLogs(query);

  return c.json(
    {
      success: true as const,
      data: items,
      meta: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages: Math.ceil(total / query.limit),
      },
      requestId: c.get("requestId"),
      timestamp: new Date().toISOString(),
    },
    200
  );
});
