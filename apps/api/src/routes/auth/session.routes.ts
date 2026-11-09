import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import {
  listSessionTenants,
  switchSessionBranch,
  switchSessionTenant,
} from "../../services/auth/session.service.js";
import {
  problemDetailsResponseSchema,
  readSessionToken,
} from "./shared.js";

const switchBranchSchema = z.object({
  branchId: z.string().min(1, "Branch ID is required"),
});

const switchBranchSuccessSchema = z.object({
  success: z.literal(true),
  data: z.object({
    activeOrganizationId: z.string(),
    activeBranchId: z.string(),
    branch: z.object({
      id: z.string(),
      name: z.string(),
      code: z.string(),
      type: z.string(),
      timezone: z.string(),
      currency: z.string(),
      locale: z.string(),
    }),
    effectiveRoles: z.array(z.string()),
    permissions: z.array(z.string()),
  }),
});

const listTenantsResponseSchema = z.object({
  tenants: z.array(
    z.object({
      organizationId: z.string(),
      name: z.string(),
      slug: z.string(),
      role: z.string(),
      logoUrl: z.string().nullable(),
    })
  ),
});

const switchTenantResponseSchema = z.object({
  success: z.boolean(),
  redirectUrl: z.string(),
});

const switchBranchRoute = createRoute({
  method: "post",
  path: "/switch-branch",
  tags: ["Identity, Sessions & Auth"],
  summary: "Switch active operational branch",
  description: "Switches the user's active operational branch context within their session, verifying user branch role membership.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: switchBranchSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: switchBranchSuccessSchema,
        },
      },
      description: "Active branch switched successfully.",
    },
    401: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Unauthorized or missing session token.",
    },
  },
});

const listTenantsRoute = createRoute({
  method: "get",
  path: "/tenants",
  tags: ["Identity, Sessions & Auth"],
  summary: "List user workspace memberships",
  description: "Returns all active organizations and roles for the authenticated user.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: listTenantsResponseSchema,
        },
      },
      description: "List of user workspace memberships",
    },
    401: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Authentication required",
    },
  },
});

const switchTenantRoute = createRoute({
  method: "post",
  path: "/switch-tenant",
  tags: ["Identity, Sessions & Auth"],
  summary: "Switch active organization context",
  description: "Validates tenant membership and issues updated tenant context.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            organizationId: z.string().openapi({ description: "Target organization ID to switch into" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: switchTenantResponseSchema,
        },
      },
      description: "Active tenant context updated",
    },
    403: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Forbidden: user does not belong to target organization",
    },
  },
});

export function registerSessionRoutes(router: OpenAPIHono): void {
  router.openapi(switchBranchRoute, async (c) => {
    const token = readSessionToken(c);
    const { branchId } = c.req.valid("json");
    return c.json(await switchSessionBranch(token, branchId), 200);
  });

  router.openapi(listTenantsRoute, async (c) => {
    const tenants = await listSessionTenants(readSessionToken(c));
    return c.json({ tenants }, 200);
  });

  router.openapi(switchTenantRoute, async (c) => {
    const token = readSessionToken(c);
    const { organizationId } = c.req.valid("json");
    await switchSessionTenant(token, organizationId);
    return c.json({ success: true, redirectUrl: "/dashboard" }, 200);
  });
}
