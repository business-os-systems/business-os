import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isPlatformCapability,
  PLATFORM_CAPABILITIES,
  type PlatformCapability,
} from "@suite/core";
import { CONTROL_SESSION_COOKIE_NAME } from "@suite/auth/platform";
import { platformAuthRouter } from "../../../src/routes/admin/auth.js";
import { adminFlagsRouter } from "../../../src/routes/admin-flags.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";

function loadPlatformEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const keys = new Set([
    "DATABASE_URL",
    "PLATFORM_DATABASE_URL",
    "CONTROL_SESSION_SECRET",
    "CONTROL_PLANE_ORIGIN",
    "CONTROL_WEBAUTHN_RP_ID",
  ]);
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    if (!keys.has(key) || process.env[key] !== undefined) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
}

loadPlatformEnv();

const CONTROL_PLANE_ORIGIN =
  process.env.CONTROL_PLANE_ORIGIN ?? "http://localhost:3002";
const FOREIGN_ORIGIN = "https://attacker.example";

process.env.CONTROL_PLANE_ORIGIN = CONTROL_PLANE_ORIGIN;
platformAuthRouter.onError(globalErrorHandler);
adminFlagsRouter.onError(globalErrorHandler);

type RouterKey = "platform-auth" | "admin-flags";

const ROUTERS = {
  "platform-auth": platformAuthRouter,
  "admin-flags": adminFlagsRouter,
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
  readonly method: "GET" | "POST" | "PATCH";
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
    anonymous: { status: 401, code: "AUTH_UNAUTHORIZED" },
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
    id: "admin-flags/list",
    method: "GET",
    path: "/flags",
    router: "admin-flags",
    anonymous: { status: 401, code: "AUTH_UNAUTHORIZED" },
    originGuarded: false,
  },
  {
    id: "admin-flags/create",
    method: "POST",
    path: "/flags",
    router: "admin-flags",
    anonymous: { status: 401, code: "AUTH_UNAUTHORIZED" },
    originGuarded: false,
  },
  {
    id: "admin-flags/update",
    method: "PATCH",
    path: "/flags/platform.denial",
    router: "admin-flags",
    anonymous: { status: 401, code: "AUTH_UNAUTHORIZED" },
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
  "platform:tenants:lifecycle": "P-13 (#222)",
  "platform:quotas:manage": "P-21 (#230)",
  "platform:entitlements:manage": "P-20 (#229)",
  "platform:operators:manage": "P-17 (#226)",
  "platform:pii:read": "P-11 (#220)",
  "platform:audit:read": "P-26 (#235)",
  "platform:catalogs:manage": "P-23 (#232)",
  "platform:impersonate": "P-28 (#237)",
  "platform:telemetry:read": "P-15 (#224)",
  "platform:flags:manage": "P-15 (#224)",
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

  for (const route of guardedRoutes()) {
    it(`rejects a foreign origin on ${route.id}`, async () => {
      const response = await requestRoute(route, { Origin: FOREIGN_ORIGIN });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("CORS_ORIGIN_DENIED");
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
