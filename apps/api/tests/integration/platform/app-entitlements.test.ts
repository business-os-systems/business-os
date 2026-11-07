import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { Prisma } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { PLATFORM_AUDIT_ACTIONS } from "@suite/auth/platform";
import {
  ENTITLEMENT_RATE_LIMIT_KEY,
  ENTITLEMENT_READ_RATE_LIMIT_KEY,
  platformEntitlementsRouter,
} from "../../../src/routes/admin/entitlements.js";
import { adminRouter } from "../../../src/routes/admin/index.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();
const EMAIL_PREFIX = "app-entitlements";
const APP_ID = "website-builder";

interface BranchOverride {
  readonly branchId: string;
  readonly isEnabled: boolean;
}

interface EntitlementApp {
  readonly appId: string;
  readonly isEnabled: boolean;
  readonly installedAt: string;
  readonly version: string;
  readonly branchOverrides: BranchOverride[];
}

interface Envelope<T> {
  readonly success: true;
  readonly data: T;
}

interface SettingsView {
  readonly appId: string;
  readonly schema: { fields: { key: string; kind: string }[] };
  readonly values: Record<string, unknown>;
  readonly staleFields: { name: string; reason: string }[];
  readonly version: string;
}

let fixture: OperatorFixture;
let managerToken: string;
let limitedToken: string;
const organizationIds: string[] = [];

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}): Promise<Response> {
  return sendOperatorRequest(platformEntitlementsRouter, input);
}

async function createTenant(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Entitlement ${label} ${fixture.suffix}`,
      slug: `entitlement-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  return organization.id;
}

async function createTenantWithApp(
  label: string,
  settings: Prisma.InputJsonValue = {}
): Promise<string> {
  const organizationId = await createTenant(label);
  await fixture.ownerPrisma.installedApp.create({
    data: { organizationId, appId: APP_ID, settings },
  });
  return organizationId;
}

async function readEntitlements(
  organizationId: string
): Promise<EntitlementApp[]> {
  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{ apps: EntitlementApp[] }>;
  return body.data.apps;
}

async function readSettings(organizationId: string): Promise<Envelope<SettingsView>> {
  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Envelope<SettingsView>;
}

beforeAll(async () => {
  if (!enabled) return;
  platformEntitlementsRouter.onError(globalErrorHandler);
  adminRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(ENTITLEMENT_RATE_LIMIT_KEY);
  await clearRateLimitStore(ENTITLEMENT_READ_RATE_LIMIT_KEY);
  managerToken = (
    await fixture.createOperator([
      PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
    ])
  ).token;
  limitedToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])
  ).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(ENTITLEMENT_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  if (organizationIds.length > 0) {
    await fixture.ownerPrisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  await fixture.cleanup();
});

it.skipIf(!enabled)("toggles an installed app and writes the audit row", async () => {
  const organizationId = await createTenantWithApp("toggle");
  const observed = (await readEntitlements(organizationId))[0];
  expect(observed?.isEnabled).toBe(true);

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
    body: {
      appId: APP_ID,
      enabled: false,
      expectedVersion: observed?.version,
    },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{ apps: EntitlementApp[] }>;
  expect(body.data.apps[0]?.isEnabled).toBe(false);
  expect(body.data.apps[0]?.version).not.toBe(observed?.version);

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_ENTITLEMENT_SET,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.before).toMatchObject({ isEnabled: true });
  expect(audit?.after).toMatchObject({ isEnabled: false });
});

it.skipIf(!enabled)("refuses a stale version instead of overwriting", async () => {
  const organizationId = await createTenantWithApp("stale");
  const observed = (await readEntitlements(organizationId))[0];
  const path = `/tenants/${organizationId}/entitlements`;

  const first = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: {
      appId: APP_ID,
      enabled: false,
      expectedVersion: observed?.version,
    },
  });
  expect(first.status).toBe(200);

  const stale = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: {
      appId: APP_ID,
      enabled: true,
      expectedVersion: observed?.version,
    },
  });
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(
    PLATFORM_ERROR_CODE.VERSION_CONFLICT
  );

  const after = (await readEntitlements(organizationId))[0];
  expect(after?.isEnabled).toBe(false);
});

it.skipIf(!enabled)("refuses an app the tenant does not have (FR-029)", async () => {
  const organizationId = await createTenant("not-installed");

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
    body: {
      appId: APP_ID,
      enabled: false,
      expectedVersion: "2026-01-01T00:00:00.000000Z",
    },
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_APP
  );
});

it.skipIf(!enabled)("refuses an installed app outside the compiled registry", async () => {
  const organizationId = await createTenant("unregistered");
  await fixture.ownerPrisma.installedApp.create({
    data: { organizationId, appId: "legacy-app" },
  });

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
    body: {
      appId: "legacy-app",
      enabled: false,
      expectedVersion: "2026-01-01T00:00:00.000000Z",
    },
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_APP
  );
});

it.skipIf(!enabled)("applies an idempotent retry exactly once", async () => {
  const organizationId = await createTenantWithApp("idempotent");
  const observed = (await readEntitlements(organizationId))[0];
  const request = {
    method: "PUT",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
    idempotencyKey: `idem-${Date.now().toString(36)}`,
    body: {
      appId: APP_ID,
      enabled: false,
      expectedVersion: observed?.version,
    },
  } as const;

  const first = await send(request);
  expect(first.status).toBe(200);
  const firstBody = await first.json();

  const replay = await send(request);
  expect(replay.status).toBe(200);
  expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  expect(await replay.json()).toEqual(firstBody);

  const audits = await fixture.ownerPrisma.auditEvent.count({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_ENTITLEMENT_SET,
    },
  });
  expect(audits).toBe(1);
});

it.skipIf(!enabled)("changes one tenant without touching another (FR-030)", async () => {
  const firstOrganization = await createTenantWithApp("isolated-first");
  const secondOrganization = await createTenantWithApp("isolated-second");
  const observed = (await readEntitlements(firstOrganization))[0];

  const response = await send({
    method: "PUT",
    path: `/tenants/${firstOrganization}/entitlements`,
    token: managerToken,
    body: {
      appId: APP_ID,
      enabled: false,
      expectedVersion: observed?.version,
    },
  });
  expect(response.status).toBe(200);

  const other = await readEntitlements(secondOrganization);
  expect(other[0]?.isEnabled).toBe(true);
});

it.skipIf(!enabled)("is reachable through the composed admin router", async () => {
  const organizationId = await createTenantWithApp("composed");
  const response = await sendOperatorRequest(adminRouter, {
    method: "GET",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{ apps: EntitlementApp[] }>;
  expect(body.data.apps[0]?.appId).toBe(APP_ID);
});

it.skipIf(!enabled)("returns read-only per-branch overrides", async () => {
  const organizationId = await createTenantWithApp("branch-override");
  const branch = await fixture.ownerPrisma.branch.create({
    data: {
      organizationId,
      name: "Main Branch",
      code: `BR-${fixture.suffix}`,
      type: "homestay",
    },
  });
  await fixture.ownerPrisma.appBranchConfig.create({
    data: {
      organizationId,
      branchId: branch.id,
      appId: APP_ID,
      isEnabled: false,
    },
  });

  const apps = await readEntitlements(organizationId);
  expect(apps[0]?.branchOverrides).toEqual([
    { branchId: branch.id, isEnabled: false },
  ]);
});

it.skipIf(!enabled)("denies entitlement reads and writes without the capability", async () => {
  const organizationId = await createTenantWithApp("denied");
  const path = `/tenants/${organizationId}/entitlements`;

  const read = await send({ method: "GET", path, token: limitedToken });
  expect(read.status).toBe(403);
  expect((await parseProblem(read)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );

  const write = await send({
    method: "PUT",
    path,
    token: limitedToken,
    body: { appId: APP_ID, enabled: false, expectedVersion: "stale" },
  });
  expect(write.status).toBe(403);
  expect((await parseProblem(write)).code).toBe(
    PLATFORM_ERROR_CODE.CAPABILITY_DENIED
  );
});

it.skipIf(!enabled)("surfaces stale settings without discarding them (FR-111)", async () => {
  const organizationId = await createTenantWithApp("stale-settings", {
    legacyFlag: true,
    customDomainEnabled: true,
  });

  const body = await readSettings(organizationId);

  expect(body.data.values).toMatchObject({
    legacyFlag: true,
    customDomainEnabled: true,
  });
  expect(body.data.staleFields.map((field) => field.name)).toContain(
    "legacyFlag"
  );
});

it.skipIf(!enabled)("preserves install metadata when settings change", async () => {
  const organizationId = await createTenantWithApp("install-metadata", {
    code: "App 01",
    name: "Website Builder",
    title: "Website Builder & Headless CMS",
    href: "/sites",
    iconName: "sites",
    description: "Visual canvas studio.",
    permission: "cms:sites:read",
    installedBy: "usr_fixture_operator",
    customDomainEnabled: true,
  });

  const observed = await readSettings(organizationId);
  expect(observed.data.values).toEqual({ customDomainEnabled: true });
  expect(JSON.stringify(observed.data)).not.toContain("installedBy");

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
    body: {
      values: { customDomainEnabled: false },
      expectedVersion: observed.data.version,
    },
  });
  expect(response.status).toBe(200);

  const stored = await fixture.ownerPrisma.installedApp.findFirst({
    where: { organizationId, appId: APP_ID },
    select: { settings: true },
  });
  expect(stored?.settings).toMatchObject({
    code: "App 01",
    name: "Website Builder",
    installedBy: "usr_fixture_operator",
    customDomainEnabled: false,
  });
});

it.skipIf(!enabled)("reports configuration keys removed by a valid write", async () => {
  const organizationId = await createTenantWithApp("removed-fields", {
    legacyFlag: true,
    customDomainEnabled: true,
  });
  const observed = await readSettings(organizationId);

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
    body: {
      values: { customDomainEnabled: false },
      expectedVersion: observed.data.version,
    },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{
    removedFields: string[];
    values: Record<string, unknown>;
  }>;
  expect(body.data.removedFields).toEqual(["legacyFlag"]);
  expect(body.data.values).toEqual({ customDomainEnabled: false });

  const after = await readSettings(organizationId);
  expect(after.data.staleFields).toEqual([]);
});

it.skipIf(!enabled)("refuses settings for an app outside the registry", async () => {
  const organizationId = await createTenant("settings-unregistered");
  await fixture.ownerPrisma.installedApp.create({
    data: { organizationId, appId: "legacy-app" },
  });

  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/apps/legacy-app/settings`,
    token: managerToken,
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_APP
  );
});

it.skipIf(!enabled)("refuses settings for an app the tenant does not have", async () => {
  const organizationId = await createTenant("settings-not-installed");

  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
  });

  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(
    PLATFORM_ERROR_CODE.UNKNOWN_APP
  );
});

it.skipIf(!enabled)("rejects an invalid payload before anything is stored", async () => {
  const organizationId = await createTenantWithApp("invalid-settings");
  const observed = await readSettings(organizationId);

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
    body: {
      values: { defaultLocale: "not a locale" },
      expectedVersion: observed.data.version,
    },
  });

  expect(response.status).toBe(422);
  const problem = await parseProblem(response);
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.SETTINGS_INVALID);
  expect(problem.invalidParams?.[0]?.name).toBe("defaultLocale");

  const after = await readSettings(organizationId);
  expect(after.data.values).toEqual({});
  expect(after.data.version).toBe(observed.data.version);
});

it.skipIf(!enabled)("stores validated settings and audits only the keys", async () => {
  const organizationId = await createTenantWithApp("valid-settings");
  const observed = await readSettings(organizationId);

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
    body: {
      values: { customDomainEnabled: true, defaultLocale: "en-IN" },
      expectedVersion: observed.data.version,
    },
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as Envelope<{
    values: Record<string, unknown>;
    staleFields: unknown[];
    version: string;
  }>;
  expect(body.data.values).toEqual({
    customDomainEnabled: true,
    defaultLocale: "en-IN",
  });
  expect(body.data.staleFields).toEqual([]);

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_APP_SETTING_SET,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.before).toEqual({ settingKeys: [] });
  expect(audit?.after).toEqual({
    settingKeys: ["customDomainEnabled", "defaultLocale"],
  });
});

it.skipIf(!enabled)("audits only the keys that changed", async () => {
  const organizationId = await createTenantWithApp("changed-keys");
  const observed = await readSettings(organizationId);
  const path = `/tenants/${organizationId}/apps/${APP_ID}/settings`;

  const first = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: {
      values: { customDomainEnabled: true, defaultLocale: "en-IN" },
      expectedVersion: observed.data.version,
    },
  });
  expect(first.status).toBe(200);
  const firstBody = (await first.json()) as Envelope<{ version: string }>;

  const second = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: {
      values: { customDomainEnabled: false, defaultLocale: "en-IN" },
      expectedVersion: firstBody.data.version,
    },
  });
  expect(second.status).toBe(200);

  const audit = await fixture.ownerPrisma.auditEvent.findFirst({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_APP_SETTING_SET,
    },
    orderBy: { occurredAt: "desc" },
  });
  expect(audit?.after).toEqual({ settingKeys: ["customDomainEnabled"] });
});

it.skipIf(!enabled)("applies an idempotent settings retry exactly once", async () => {
  const organizationId = await createTenantWithApp("settings-idempotent");
  const observed = await readSettings(organizationId);
  const request = {
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
    idempotencyKey: `idem-settings-${Date.now().toString(36)}`,
    body: {
      values: { customDomainEnabled: true },
      expectedVersion: observed.data.version,
    },
  } as const;

  const first = await send(request);
  expect(first.status).toBe(200);
  const firstBody = await first.json();

  const replay = await send(request);
  expect(replay.status).toBe(200);
  expect(replay.headers.get("x-idempotent-replay")).toBe("true");
  expect(await replay.json()).toEqual(firstBody);

  const audits = await fixture.ownerPrisma.auditEvent.count({
    where: {
      organizationId,
      action: PLATFORM_AUDIT_ACTIONS.TENANT_APP_SETTING_SET,
    },
  });
  expect(audits).toBe(1);
});

it.skipIf(!enabled)("refuses a stale settings version", async () => {
  const organizationId = await createTenantWithApp("stale-version");
  const observed = await readSettings(organizationId);
  const path = `/tenants/${organizationId}/apps/${APP_ID}/settings`;

  const first = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: {
      values: { customDomainEnabled: true },
      expectedVersion: observed.data.version,
    },
  });
  expect(first.status).toBe(200);

  const stale = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: {
      values: { customDomainEnabled: false },
      expectedVersion: observed.data.version,
    },
  });
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(
    PLATFORM_ERROR_CODE.VERSION_CONFLICT
  );
});

it.skipIf(!enabled)("denies settings reads and writes without the capability", async () => {
  const organizationId = await createTenantWithApp("settings-denied");
  const path = `/tenants/${organizationId}/apps/${APP_ID}/settings`;

  const read = await send({ method: "GET", path, token: limitedToken });
  expect(read.status).toBe(403);

  const write = await send({
    method: "PUT",
    path,
    token: limitedToken,
    body: { values: {}, expectedVersion: "stale" },
  });
  expect(write.status).toBe(403);
});
