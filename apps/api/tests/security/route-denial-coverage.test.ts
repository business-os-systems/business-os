import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const API_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = path.join(API_ROOT, "src/routes/admin");

/**
 * The mount prefix each route module receives in routes/admin/index.ts.
 * Auth is mounted by the application at /api/v1/admin/auth.
 */
const MOUNT_PREFIXES: Readonly<Record<string, string>> = {
  system: "/system",
  audit: "/",
  impersonation: "/",
  entitlements: "/",
  quotas: "/",
  tenants: "/",
  "tenant-pii": "/",
  lifecycle: "/",
  flags: "/flags",
  operators: "/operators",
  "operator-passkeys": "/operator-passkeys",
  catalogs: "/catalogs",
  catalog: "/catalog",
  "app-settings": "/apps",
  auth: "/auth",
};

export interface AdminRoute {
  readonly method: string;
  readonly path: string;
}

function isRouteModule(file: string): boolean {
  if (!file.endsWith(".ts")) return false;
  return !(
    file === "index.ts" ||
    file.endsWith(".schema.ts") ||
    file.endsWith(".contract.ts") ||
    file.includes("shared")
  );
}

function toFullPath(prefix: string, suffix: string): string {
  if (suffix === "/") return prefix;
  return prefix === "/" ? suffix : prefix + suffix;
}

/**
 * A route module may own more than one mount prefix. An explicit
 * "// @adminMount <prefix>" marker starts a new segment; routes before the
 * first marker use the file's default prefix.
 */
const MOUNT_MARKER = /@adminMount\s+(\S+)\s*\n/g;

interface RouteSegment {
  readonly prefix: string;
  readonly body: string;
}

function routeSegments(source: string, fallback: string): readonly RouteSegment[] {
  const segments: RouteSegment[] = [];
  let cursor = 0;
  let prefix = fallback;
  let marker: RegExpExecArray | null;
  MOUNT_MARKER.lastIndex = 0;
  while ((marker = MOUNT_MARKER.exec(source)) !== null) {
    segments.push({ prefix, body: source.slice(cursor, marker.index) });
    prefix = marker[1] ?? fallback;
    cursor = marker.index + marker[0].length;
  }
  segments.push({ prefix, body: source.slice(cursor) });
  return segments;
}

const ROUTE_PATTERN = /method:\s*"(get|post|put|patch|delete)",[\s\S]{0,160}?path:\s*"([^"]+)"/g;

function routesInSegment(segment: RouteSegment): readonly AdminRoute[] {
  const routes: AdminRoute[] = [];
  ROUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ROUTE_PATTERN.exec(segment.body)) !== null) {
    const method = match[1];
    const suffix = match[2];
    if (method === undefined || suffix === undefined) continue;
    routes.push({
      method: method.toUpperCase(),
      path: toFullPath(segment.prefix, suffix),
    });
  }
  return routes;
}

/** Parses every createRoute({ method, path }) in the admin route modules. */
export function readAdminRoutes(): readonly AdminRoute[] {
  const routes: AdminRoute[] = [];

  for (const file of readdirSync(ROUTES_DIR)) {
    if (!isRouteModule(file)) continue;
    const source = readFileSync(path.join(ROUTES_DIR, file), "utf8");
    const fallback = MOUNT_PREFIXES[file.replace(".ts", "")] ?? "/";
    for (const segment of routeSegments(source, fallback)) {
      routes.push(...routesInSegment(segment));
    }
  }

  return routes;
}

function routeKey(route: AdminRoute): string {
  return route.method + " " + route.path;
}

/**
 * Every admin route and the suite that proves its denial behaviour. A new
 * route fails this inventory until it is added here with a denial suite; the
 * suite must exist and contain an explicit denial assertion (CT-2).
 */
const AUTH_ROUTES = "tests/platform-auth-routes.test.ts";
const CATALOGS = "tests/contract/platform/catalogs.test.ts";
const ENTITLEMENTS = "tests/contract/platform/entitlements.test.ts";
const DENIAL_MATRIX = "tests/integration/platform/denial-matrix.test.ts";
const APP_SETTINGS_DEFAULTS =
  "tests/integration/platform/app-settings-defaults.test.ts";
const IMPERSONATION = "tests/integration/platform/impersonation.test.ts";
const OPERATOR_ENROLMENT = "tests/integration/platform/operator-enrolment.test.ts";
const OPERATOR_ADD_PASSKEY = "tests/integration/platform/operator-add-passkey.test.ts";
const AUDIT = "tests/contract/platform/audit.test.ts";
const QUOTAS = "tests/contract/platform/quotas.test.ts";
const TENANT_PII = "tests/integration/platform/tenant-pii.test.ts";
const CATALOG_DENIAL = "tests/security/catalog-denial.test.ts";
const SITE_TAKEDOWN = "tests/integration/platform/site-takedown.test.ts";

const DENIAL_COVERAGE: Readonly<Record<string, string>> = {
  "GET /": ENTITLEMENTS,
  "PATCH /{appId}": ENTITLEMENTS,
  "GET /audit": AUDIT,
  "GET /audit/verify": AUDIT,
  "GET /audit/export": AUDIT,
  "POST /auth/bootstrap/options": AUTH_ROUTES,
  "POST /auth/bootstrap/verify": AUTH_ROUTES,
  "POST /auth/sign-in/options": AUTH_ROUTES,
  "POST /auth/sign-in/verify": AUTH_ROUTES,
  "GET /auth/me": AUTH_ROUTES,
  "POST /auth/logout": AUTH_ROUTES,
  "POST /auth/step-up/verify": "tests/integration/platform/step-up.test.ts",
  "GET /apps/{appId}/settings": APP_SETTINGS_DEFAULTS,
  "PATCH /apps/{appId}/settings": APP_SETTINGS_DEFAULTS,
  "GET /catalogs": CATALOGS,
  "POST /catalogs/{category}/values": CATALOGS,
  "PATCH /catalogs/{category}/values/{code}": CATALOGS,
  "GET /tenants/{orgId}/entitlements": ENTITLEMENTS,
  "PUT /tenants/{orgId}/entitlements": ENTITLEMENTS,
  "GET /tenants/{orgId}/apps/{appId}/settings": ENTITLEMENTS,
  "PUT /tenants/{orgId}/apps/{appId}/settings": ENTITLEMENTS,
  "GET /flags": DENIAL_MATRIX,
  "POST /flags": DENIAL_MATRIX,
  "PATCH /flags/{key}": DENIAL_MATRIX,
  "POST /impersonation": IMPERSONATION,
  "DELETE /impersonation/{ticketId}": IMPERSONATION,
  "GET /impersonation/active": IMPERSONATION,
  "POST /tenants/{orgId}/suspend": DENIAL_MATRIX,
  "POST /tenants/{orgId}/restore": DENIAL_MATRIX,
  "POST /tenants/{orgId}/archive": DENIAL_MATRIX,
  "POST /operator-passkeys/enrolment/options": OPERATOR_ENROLMENT,
  "POST /operator-passkeys/enrolment/verify": OPERATOR_ENROLMENT,
  "POST /operator-passkeys/enrolment/token": OPERATOR_ADD_PASSKEY,
  "POST /operator-passkeys/enrolment/add/options": OPERATOR_ADD_PASSKEY,
  "POST /operator-passkeys/enrolment/add/verify": OPERATOR_ADD_PASSKEY,
  "GET /operators": DENIAL_MATRIX,
  "POST /operators": DENIAL_MATRIX,
  "PATCH /operators/{operatorId}": DENIAL_MATRIX,
  "PATCH /operators/{operatorId}/capabilities": DENIAL_MATRIX,
  "GET /operators/{operatorId}/sessions": DENIAL_MATRIX,
  "DELETE /operators/{operatorId}/sessions/{sessionId}": DENIAL_MATRIX,
  "GET /tenants/{orgId}/quotas": QUOTAS,
  "PUT /tenants/{orgId}/quotas": QUOTAS,
  "GET /system/health": DENIAL_MATRIX,
  "GET /system/queues": DENIAL_MATRIX,
  "GET /tenants/{orgId}/pii": TENANT_PII,
  "GET /tenants": DENIAL_MATRIX,
  "GET /tenants/{orgId}": DENIAL_MATRIX,
  "GET /tenants/{orgId}/sites": SITE_TAKEDOWN,
  "POST /tenants/{orgId}/sites/{siteId}/suspend": SITE_TAKEDOWN,
  "POST /tenants/{orgId}/sites/{siteId}/restore": SITE_TAKEDOWN,
  "GET /apps/website-builder/items": CATALOG_DENIAL,
  "POST /apps/website-builder/items": CATALOG_DENIAL,
  "GET /apps/website-builder/items/{id}": CATALOG_DENIAL,
  "PATCH /apps/website-builder/items/{id}": CATALOG_DENIAL,
  "POST /apps/website-builder/items/{id}/versions": CATALOG_DENIAL,
  "GET /apps/website-builder/items/{id}/versions": CATALOG_DENIAL,
  "POST /apps/website-builder/items/{id}/preview": CATALOG_DENIAL,
  "POST /apps/website-builder/items/{id}/publish": CATALOG_DENIAL,
  "POST /apps/website-builder/items/{id}/deprecate": CATALOG_DENIAL,
  "POST /apps/website-builder/items/{id}/disable": CATALOG_DENIAL,
  "POST /apps/website-builder/items/{id}/retire": CATALOG_DENIAL,
};

const DENIAL_MARKER = /CAPABILITY_DENIED|AUTH_REQUIRED|UNAUTHORIZED|\b403\b|\b401\b/;

describe("admin route denial coverage (CT-2, T152)", () => {
  it("maps every admin route to a denial suite", () => {
    const inventory = readAdminRoutes().map(routeKey).sort();
    const registry = Object.keys(DENIAL_COVERAGE).sort();

    expect(inventory).toEqual(registry);
  });

  it("points every route at an existing suite with a denial assertion", () => {
    for (const [route, testFile] of Object.entries(DENIAL_COVERAGE)) {
      const absolute = path.join(API_ROOT, testFile);
      expect(existsSync(absolute), route + " -> " + testFile).toBe(true);
      expect(readFileSync(absolute, "utf8"), route + " -> " + testFile).toMatch(DENIAL_MARKER);
    }
  });
});
