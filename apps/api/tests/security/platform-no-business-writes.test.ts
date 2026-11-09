import { describe, expect, it } from "vitest";
import { adminRouter } from "../../src/routes/admin/index.js";
import { platformAuthRouter } from "../../src/routes/admin/auth.js";

interface ExposedRoute {
  readonly method: string;
  readonly path: string;
}

const WRITE_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/**
 * Hono 4 merges composed child routes into the parent `routes` table, so
 * `adminRouter` already lists the flags, tenant and PII routes. Operator auth
 * is mounted beside it at /api/v1/admin/auth (app.ts), so both are inspected.
 */
const PLATFORM_ROUTERS: readonly {
  readonly routes: readonly ExposedRoute[];
}[] = [platformAuthRouter, adminRouter];

interface PermittedWrite {
  readonly method: string;
  readonly path: string;
  readonly reason: string;
}

const PERMITTED_WRITES: readonly PermittedWrite[] = [
  { method: "POST", path: "/bootstrap/options", reason: "operator bootstrap" },
  { method: "POST", path: "/bootstrap/verify", reason: "operator bootstrap" },
  { method: "POST", path: "/sign-in/options", reason: "operator sign-in" },
  { method: "POST", path: "/sign-in/verify", reason: "operator sign-in" },
  { method: "POST", path: "/logout", reason: "operator sign-out" },
  { method: "POST", path: "/flags", reason: "platform configuration" },
  // Tenant lifecycle changes the platform-owned Organisation status; it writes
  // no tenant business record (FR-019, contracts/admin-api.md).
  { method: "POST", path: "/tenants/:orgId/suspend", reason: "tenant lifecycle" },
  { method: "POST", path: "/tenants/:orgId/restore", reason: "tenant lifecycle" },
  { method: "POST", path: "/tenants/:orgId/archive", reason: "tenant lifecycle" },
  // Entitlements and app settings are platform-governed installation metadata.
  // Both writes go through narrow audited definer functions; Platform never
  // gains a grant on the public tenant tables.
  {
    method: "PUT",
    path: "/tenants/:orgId/entitlements",
    reason: "app entitlement governance",
  },
  {
    method: "PUT",
    path: "/tenants/:orgId/apps/:appId/settings",
    reason: "validated application settings",
  },
  // Quotas are platform-owned configuration, written through one audited
  // definer function per item; no tenant business record is touched.
  { method: "PUT", path: "/tenants/:orgId/quotas", reason: "quota governance" },
  // zod-openapi registers Hono's ":key" form, not the documented "{key}".
  { method: "PATCH", path: "/flags/:key", reason: "platform configuration" },
  // Catalog overrides change Platform-owned presentation only; hiding an app
  // never disables an existing installation (FR-083, FR-084).
  {
    method: "PATCH",
    path: "/catalog/:appId",
    reason: "app catalog overrides",
  },
  // Reference catalogs are Platform-owned shared vocabularies; adding or
  // retiring a value writes no tenant business record (FR-101, FR-107, CT-7).
  {
    method: "POST",
    path: "/catalogs/:category/values",
    reason: "reference catalog governance",
  },
  {
    method: "PATCH",
    path: "/catalogs/:category/values/:code",
    reason: "reference catalog governance",
  },
  { method: "POST", path: "/operators", reason: "operator invitation" },
  { method: "PATCH", path: "/operators/:operatorId", reason: "operator governance" },
  {
    method: "PATCH",
    path: "/operators/:operatorId/capabilities",
    reason: "operator governance",
  },
  {
    method: "DELETE",
    path: "/operators/:operatorId/sessions/:sessionId",
    reason: "operator session revocation",
  },
  {
    method: "POST",
    path: "/operator-passkeys/enrolment/options",
    reason: "invited-operator passkey enrolment",
  },
  {
    method: "POST",
    path: "/operator-passkeys/enrolment/verify",
    reason: "invited-operator passkey enrolment",
  },
  // A support session writes only Platform-owned session state and its audit
  // row; the tenant plane stays read-only for the session lifetime
  // (FR-045, FR-050, SC-017).
  { method: "POST", path: "/impersonation", reason: "time-boxed support session" },
  {
    method: "DELETE",
    path: "/impersonation/:ticketId",
    reason: "support-session termination",
  },
];

interface ForbiddenWritePattern {
  readonly name: string;
  readonly methods: ReadonlySet<string>;
  readonly path: RegExp;
}

const TENANT_RECORD_WRITES: ReadonlySet<string> = new Set([
  "PUT",
  "PATCH",
  "DELETE",
]);

const FORBIDDEN_WRITE_PATTERNS: readonly ForbiddenWritePattern[] = [
  {
    name: "tenant record mutation",
    methods: TENANT_RECORD_WRITES,
    path: /^\/tenants\/[^/]+$/,
  },
  {
    name: "tenant PII write",
    methods: WRITE_METHODS,
    path: /^\/tenants\/[^/]+\/pii(?:\/|$)/,
  },
  {
    name: "tenant business-resource write",
    methods: WRITE_METHODS,
    path: /^\/(?:cms|sites|pages|orders|bookings|inventory)(?:\/|$)/,
  },
];

function exposedWriteRoutes(): readonly ExposedRoute[] {
  const routes = PLATFORM_ROUTERS.flatMap((router) =>
    router.routes
      .map((route) => ({
        method: route.method.toUpperCase(),
        path: route.path,
      }))
      .filter((route) => WRITE_METHODS.has(route.method)),
  );

  // Hono records one entry per handler, so a validated route repeats once per
  // validator. Collapse the entries into distinct method/path pairs.
  const distinct = new Map(
    routes.map((route) => [`${route.method} ${route.path}`, route]),
  );
  return [...distinct.values()];
}

describe("Platform admin write surface", () => {
  it("exposes only the permitted write routes", () => {
    const unexpected = exposedWriteRoutes().filter(
      (route) =>
        !PERMITTED_WRITES.some(
          (permitted) =>
            permitted.method === route.method && permitted.path === route.path,
        ),
    );

    expect(
      unexpected.map((route) => `${route.method} ${route.path}`),
      "Add a PERMITTED_WRITES entry with a reason, or remove the route.",
    ).toEqual([]);
  });

  it("still exposes every permitted write route", () => {
    const routes = exposedWriteRoutes();
    const missing = PERMITTED_WRITES.filter(
      (permitted) =>
        !routes.some(
          (route) =>
            route.method === permitted.method && route.path === permitted.path,
        ),
    );

    expect(
      missing.map((permitted) => `${permitted.method} ${permitted.path}`),
      "Remove the stale permit so the allowlist keeps matching the router.",
    ).toEqual([]);
  });

  it.each(FORBIDDEN_WRITE_PATTERNS)("exposes no $name", ({ methods, path }) => {
    const violations = exposedWriteRoutes().filter(
      (route) => methods.has(route.method) && path.test(route.path),
    );

    expect(
      violations.map((route) => `${route.method} ${route.path}`),
      "The Platform may read tenant data, never edit it.",
    ).toEqual([]);
  });
});
