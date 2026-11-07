import { describe, expect, it } from "vitest";
import {
  isPlatformCapability,
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  type PlatformCapability,
} from "@suite/core";
import { CONTROL_SESSION_COOKIE_NAME } from "@suite/auth/platform";
import { platformAuthRouter } from "../../../src/routes/admin/auth.js";
import { platformFlagsRouter } from "../../../src/routes/admin/flags.js";
import { platformOperatorsRouter } from "../../../src/routes/admin/operators.js";
import { platformEntitlementsRouter } from "../../../src/routes/admin/entitlements.js";
import { platformSystemRouter } from "../../../src/routes/admin/system.js";
import { tenantAdminRouter } from "../../../src/routes/admin/tenants.js";
import { tenantPiiRouter } from "../../../src/routes/admin/tenant-pii.js";
import { tenantLifecycleRouter } from "../../../src/routes/admin/lifecycle.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";

loadPlatformTestEnv();

function requireControlPlaneOrigin(): string {
  const value = process.env.CONTROL_PLANE_ORIGIN;
  if (value === undefined) {
    throw new Error(
      "CONTROL_PLANE_ORIGIN must be declared before running the denial matrix",
    );
  }
  return value;
}

const CONTROL_PLANE_ORIGIN = requireControlPlaneOrigin();
const FOREIGN_ORIGIN = "https://attacker.example";
const ADMIN_OPERATORS_ROUTER = "admin-operators" as const;
const ADMIN_ENTITLEMENTS_ROUTER = "admin-entitlements" as const;

process.env.CONTROL_PLANE_ORIGIN = CONTROL_PLANE_ORIGIN;
platformAuthRouter.onError(globalErrorHandler);
platformSystemRouter.onError(globalErrorHandler);
platformFlagsRouter.onError(globalErrorHandler);
platformOperatorsRouter.onError(globalErrorHandler);
platformEntitlementsRouter.onError(globalErrorHandler);
tenantAdminRouter.onError(globalErrorHandler);
tenantPiiRouter.onError(globalErrorHandler);
tenantLifecycleRouter.onError(globalErrorHandler);

type RouterKey =
  | "platform-auth"
  | "admin-system"
  | "admin-flags"
  | typeof ADMIN_OPERATORS_ROUTER
  | typeof ADMIN_ENTITLEMENTS_ROUTER
  | "admin-tenants"
  | "admin-tenant-pii"
  | "admin-tenant-lifecycle";

const ROUTERS = {
  "platform-auth": platformAuthRouter,
  "admin-system": platformSystemRouter,
  "admin-flags": platformFlagsRouter,
  [ADMIN_OPERATORS_ROUTER]: platformOperatorsRouter,
  [ADMIN_ENTITLEMENTS_ROUTER]: platformEntitlementsRouter,
  "admin-tenants": tenantAdminRouter,
  "admin-tenant-pii": tenantPiiRouter,
  "admin-tenant-lifecycle": tenantLifecycleRouter,
} as const;

/**
 * Sign-out is intentionally idempotent: an anonymous caller gets 204 with the
 * cookie cleared rather than a 401, so a stale browser does not trap the user.
 */
type AnonymousOutcome =
  | { readonly status: 401; readonly code: string }
  | { readonly status: 204; readonly code: null };

interface ProtectedRoute {
  readonly id: string;
  readonly method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  readonly path: string;
  readonly router: RouterKey;
  readonly anonymous: AnonymousOutcome;
  readonly originGuarded: boolean;
}

/**
 * Every protected entry point of the Platform control plane. A new route must
 * be added here in the same change, otherwise its denial behaviour is unproven.
 */
const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  {
    id: "platform-auth/me",
    method: "GET",
    path: "/me",
    router: "platform-auth",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "platform-auth/logout",
    method: "POST",
    path: "/logout",
    router: "platform-auth",
    anonymous: { status: 204, code: null },
    originGuarded: true,
  },
  {
    id: "admin-tenants/list",
    method: "GET",
    path: "/tenants",
    router: "admin-tenants",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-tenants/record",
    method: "GET",
    path: "/tenants/tenant_denial_probe",
    router: "admin-tenants",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-entitlements/list",
    method: "GET",
    path: "/tenants/tenant_denial_probe/entitlements",
    router: ADMIN_ENTITLEMENTS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-entitlements/update",
    method: "PUT",
    path: "/tenants/tenant_denial_probe/entitlements",
    router: ADMIN_ENTITLEMENTS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-entitlements/settings",
    method: "GET",
    path: "/tenants/tenant_denial_probe/apps/website-builder/settings",
    router: ADMIN_ENTITLEMENTS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-entitlements/settings-update",
    method: "PUT",
    path: "/tenants/tenant_denial_probe/apps/website-builder/settings",
    router: ADMIN_ENTITLEMENTS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-tenants/pii",
    method: "GET",
    path: "/tenants/tenant_denial_probe/pii",
    router: "admin-tenant-pii",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-tenants/suspend",
    method: "POST",
    path: "/tenants/tenant_denial_probe/suspend",
    router: "admin-tenant-lifecycle",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-tenants/restore",
    method: "POST",
    path: "/tenants/tenant_denial_probe/restore",
    router: "admin-tenant-lifecycle",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-tenants/archive",
    method: "POST",
    path: "/tenants/tenant_denial_probe/archive",
    router: "admin-tenant-lifecycle",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-system/health",
    method: "GET",
    path: "/health",
    router: "admin-system",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-system/queues",
    method: "GET",
    path: "/queues",
    router: "admin-system",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-operators/list",
    method: "GET",
    path: "/",
    router: ADMIN_OPERATORS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-operators/create",
    method: "POST",
    path: "/",
    router: ADMIN_OPERATORS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-operators/update",
    method: "PATCH",
    path: "/operator_denial_probe",
    router: ADMIN_OPERATORS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-operators/capabilities",
    method: "PATCH",
    path: "/operator_denial_probe/capabilities",
    router: ADMIN_OPERATORS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-operators/sessions",
    method: "GET",
    path: "/operator_denial_probe/sessions",
    router: ADMIN_OPERATORS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-operators/session-revoke",
    method: "DELETE",
    path: "/operator_denial_probe/sessions/session_denial_probe",
    router: ADMIN_OPERATORS_ROUTER,
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: true,
  },
  {
    id: "admin-flags/list",
    method: "GET",
    path: "/",
    router: "admin-flags",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-flags/create",
    method: "POST",
    path: "/",
    router: "admin-flags",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
  {
    id: "admin-flags/update",
    method: "PATCH",
    path: "/platform.denial",
    router: "admin-flags",
    anonymous: { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED },
    originGuarded: false,
  },
];

/**
 * Where each registered capability is or will be enforced. Typed as an
 * exhaustive record so adding a capability to the registry fails typecheck
 * until it has an enforcement slice (CT-1, capability four-part rule).
 */
const CAPABILITY_ENFORCEMENT = {
  "platform:tenants:read": "P-11 (#220)",
  "platform:tenants:lifecycle": "P-13 (#222), enforced by the lifecycle routes",
  "platform:quotas:manage": "P-21 (#230)",
  "platform:entitlements:manage":
    "P-20 (#229), enforced by the entitlement and app-settings routes",
  "platform:operators:manage": "P-17 (#226)",
  "platform:pii:read": "P-11 (#220)",
  "platform:audit:read": "P-26 (#235)",
  "platform:catalogs:manage": "P-23 (#232)",
  "platform:impersonate": "P-28 (#237)",
  "platform:telemetry:read": "P-15 (#224), enforced by /system/health and /system/queues",
  "platform:flags:manage": "P-15 (#224), enforced by /flags",
} as const satisfies Record<PlatformCapability, string>;

function anonymousHeaders(route: ProtectedRoute): Record<string, string> {
  if (!route.originGuarded) {
    return {};
  }
  return { Origin: CONTROL_PLANE_ORIGIN };
}

async function requestRoute(
  route: ProtectedRoute,
  headers: Record<string, string>,
): Promise<Response> {
  const response = await ROUTERS[route.router].request(route.path, {
    method: route.method,
    headers,
  });
  return response;
}

function guardedRoutes(): readonly ProtectedRoute[] {
  return PROTECTED_ROUTES.filter((route) => route.originGuarded);
}

describe("Platform denial matrix", () => {
  for (const route of PROTECTED_ROUTES) {
    it(`applies the anonymous contract to ${route.id}`, async () => {
      const response = await requestRoute(route, anonymousHeaders(route));

      expect(response.status).toBe(route.anonymous.status);

      if (route.anonymous.status === 401) {
        expect(response.headers.get("content-type")).toContain(
          "application/problem+json",
        );
        const body = (await response.json()) as { type: string; code: string };
        expect(body.code).toBe(route.anonymous.code);
        expect(body.type).toMatch(/^\/errors\//);
      }

      if (route.anonymous.status === 204) {
        expect(response.headers.get("set-cookie")).toContain(
          `${CONTROL_SESSION_COOKIE_NAME}=`,
        );
      }
    });
  }

  it("accepts a same-origin GET that omits the Origin header", async () => {
    const response = await platformAuthRouter.request("/me", {
      method: "GET",
      headers: { "Sec-Fetch-Site": "same-origin" },
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain(
      "application/problem+json",
    );
  });

  it("rejects a GET that presents neither Origin nor Sec-Fetch-Site", async () => {
    const response = await platformAuthRouter.request("/me", { method: "GET" });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe("CORS_ORIGIN_DENIED");
  });

  for (const route of guardedRoutes()) {
    it(`rejects a foreign origin on ${route.id}`, async () => {
      const response = await requestRoute(route, { Origin: FOREIGN_ORIGIN });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe(PLATFORM_ERROR_CODE.CORS_ORIGIN_DENIED);
    });
  }
});

describe("Platform capability enforcement map", () => {
  it("assigns every registered capability to an enforcement slice", () => {
    for (const capability of Object.values(PLATFORM_CAPABILITIES)) {
      expect(CAPABILITY_ENFORCEMENT[capability.code]).toBeTruthy();
    }
  });

  it("declares no capability that the registry does not define", () => {
    for (const code of Object.keys(CAPABILITY_ENFORCEMENT)) {
      expect(isPlatformCapability(code)).toBe(true);
    }
  });
});
