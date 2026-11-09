import type { Context } from "hono";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import { getDashboardUrl } from "../../lib/env.js";
import {
  discoverSsoProvider,
  findSsoLoginConnection,
  type SsoLoginConnection,
} from "../../services/auth/sso.service.js";
import { problemDetailsResponseSchema, successBody } from "./shared.js";

const ssoDiscoverSchema = z.object({
  email: z.string().email("Valid corporate email required"),
});

const ssoDiscoverySuccessSchema = z.object({
  success: z.literal(true),
  data: z
    .object({
      domain: z.string(),
      providerType: z.string().nullable(),
      enforceSso: z.boolean(),
      organizationId: z.string().nullable(),
      organizationName: z.string().nullable(),
      organizationSlug: z.string().nullable(),
      authUrl: z.string().nullable(),
      defaultRoleId: z.string().nullable().optional(),
    })
    .nullable(),
  requestId: z.string(),
  timestamp: z.string(),
});

const ssoDiscoverRoute = createRoute({
  method: "post",
  path: "/sso/discover",
  tags: ["Identity, Sessions & Auth"],
  summary: "Discover enterprise SSO by domain",
  description: "Resolves corporate email domain to determine if tenant uses Google Workspace, Microsoft Entra, or SAML 2.0.",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ssoDiscoverSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ssoDiscoverySuccessSchema,
        },
      },
      description: "SSO discovery result returned.",
    },
  },
});

const ssoLoginRoute = createRoute({
  method: "get",
  path: "/sso/{id}/login",
  tags: ["Identity, Sessions & Auth"],
  summary: "Initiate Enterprise SSO authentication",
  description: "Redirects user to configured corporate Identity Provider (Google Workspace, Entra ID, SAML) or falls back to login page / 501 problem details.",
  request: {
    params: z.object({
      id: z.string().openapi({ description: "SSO Connection ID", example: "sso_conn_01" }),
    }),
    query: z.object({
      email: z.string().optional().openapi({ description: "User email hint", example: "user@enterprise.com" }),
    }),
  },
  responses: {
    307: {
      description: "Redirects to external IdP authorization URL or dashboard login fallback.",
    },
    404: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "SSO connection not found.",
    },
    501: {
      content: {
        "application/problem+json": {
          schema: problemDetailsResponseSchema,
        },
      },
      description: "Enterprise IdP endpoint not configured.",
    },
  },
});

const SSO_NOT_FOUND_PROBLEM = {
  type: "/errors/not-found",
  title: "Not Found",
  status: 404,
  detail: "SSO Connection not found.",
  code: "SSO_CONNECTION_NOT_FOUND",
} as const;

function isBrowserRequest(acceptHeader: string | undefined): boolean {
  const header = acceptHeader ?? "";
  return header.includes("text/html");
}

function dashboardLoginUrl(error: string): URL {
  const loginUrl = new URL("/login", getDashboardUrl());
  loginUrl.searchParams.set("error", error);
  return loginUrl;
}

function unconfiguredLoginUrl(
  connection: SsoLoginConnection,
  email: string | undefined
): string {
  const loginUrl = dashboardLoginUrl("sso_unconfigured");
  loginUrl.searchParams.set("domain", connection.domain);
  loginUrl.searchParams.set("org", connection.organizationName);
  if (email !== undefined) {
    loginUrl.searchParams.set("email", email);
  }
  return loginUrl.toString();
}

function unconfiguredProblem(connection: SsoLoginConnection) {
  return {
    type: "/errors/sso-unconfigured",
    title: "SSO Configuration Pending",
    status: 501,
    detail: `Enterprise Identity Provider for ${connection.organizationName} (${connection.domain}) is not yet configured with an active SAML 2.0 / OIDC endpoint. Please contact your workspace administrator or use standard password login.`,
    code: "SSO_IDP_NOT_CONFIGURED",
  };
}

interface SsoLoginInput {
  readonly connection: SsoLoginConnection | null;
  readonly email: string | undefined;
}

function ssoLoginResponse(c: Context, input: SsoLoginInput) {
  const browser = isBrowserRequest(c.req.header("accept"));
  const { connection, email } = input;

  if (connection === null) {
    if (browser) {
      return c.redirect(dashboardLoginUrl("sso_not_found").toString(), 307);
    }
    return c.json(SSO_NOT_FOUND_PROBLEM, 404);
  }

  if (connection.authUrl !== null) {
    return c.redirect(connection.authUrl, 307);
  }

  if (browser) {
    return c.redirect(unconfiguredLoginUrl(connection, email), 307);
  }

  return c.json(unconfiguredProblem(connection), 501);
}

export function registerSsoRoutes(router: OpenAPIHono): void {
  router.openapi(ssoDiscoverRoute, async (c) => {
    const { email } = c.req.valid("json");
    const discovery = await discoverSsoProvider(email);
    return c.json(successBody(c.get("requestId"), discovery), 200);
  });

  router.openapi(ssoLoginRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { email } = c.req.valid("query");
    const connection = await findSsoLoginConnection(id);
    return ssoLoginResponse(c, { connection, email });
  });
}
