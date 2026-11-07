import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { Prisma } from "@suite/db";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  ENTITLEMENT_RATE_LIMIT_KEY,
  ENTITLEMENT_READ_RATE_LIMIT_KEY,
  platformEntitlementsRouter,
} from "../../../src/routes/admin/entitlements.js";
import {
  appSettingsViewSchema,
  appSettingsWriteResultSchema,
} from "../../../src/services/admin/entitlement.contract.js";
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
const EMAIL_PREFIX = "app-settings";
const APP_ID = "website-builder";
const LEGACY_KEY = "legacyFlag";
const LOCALE_KEY = "defaultLocale";
const DOMAIN_KEY = "customDomainEnabled";
const INVALID_LOCALE = "not a locale";

const settingsEnvelopeSchema = z.object({ data: appSettingsViewSchema });
const settingsWriteEnvelopeSchema = z.object({
  data: appSettingsWriteResultSchema,
});

let fixture: OperatorFixture;
let managerToken: string;
const organizationIds: string[] = [];

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformEntitlementsRouter, {
    ...input,
    token: managerToken,
  });
}

async function createTenantWithApp(
  label: string,
  settings: Prisma.InputJsonValue
): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Settings ${label} ${fixture.suffix}`,
      slug: `settings-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  await fixture.ownerPrisma.installedApp.create({
    data: { organizationId: organization.id, appId: APP_ID, settings },
  });
  return organization.id;
}

async function readSettings(
  organizationId: string
): Promise<z.infer<typeof appSettingsViewSchema>> {
  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
  });
  expect(response.status).toBe(200);
  return settingsEnvelopeSchema.parse(await response.json()).data;
}

function writeSettings(
  organizationId: string,
  values: Record<string, unknown>,
  expectedVersion: string
): Promise<Response> {
  return send({
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    body: { values, expectedVersion },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  platformEntitlementsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(ENTITLEMENT_RATE_LIMIT_KEY);
  await clearRateLimitStore(ENTITLEMENT_READ_RATE_LIMIT_KEY);
  managerToken = (
    await fixture.createOperator([
      PLATFORM_CAPABILITIES.ENTITLEMENTS_MANAGE.code,
    ])
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

it.skipIf(!enabled)("surfaces every stored value that no longer validates", async () => {
  const organizationId = await createTenantWithApp("stale", {
    [LEGACY_KEY]: true,
    [LOCALE_KEY]: INVALID_LOCALE,
    [DOMAIN_KEY]: true,
  });

  const settings = await readSettings(organizationId);

  expect(settings.values).toEqual({
    [LEGACY_KEY]: true,
    [LOCALE_KEY]: INVALID_LOCALE,
    [DOMAIN_KEY]: true,
  });
  expect(settings.staleFields.map((field) => field.name)).toEqual(
    expect.arrayContaining([LEGACY_KEY, LOCALE_KEY])
  );
  expect(settings.staleFields.some((field) => field.name === DOMAIN_KEY)).toBe(
    false
  );
});

it.skipIf(!enabled)("reports removed keys only when a valid write replaces them", async () => {
  const organizationId = await createTenantWithApp("removed", {
    [LEGACY_KEY]: true,
    [LOCALE_KEY]: INVALID_LOCALE,
  });
  const observed = await readSettings(organizationId);

  const response = await writeSettings(
    organizationId,
    { [LOCALE_KEY]: "en-IN" },
    observed.version
  );

  expect(response.status).toBe(200);
  const body = settingsWriteEnvelopeSchema.parse(await response.json());
  expect(body.data.values).toEqual({ [LOCALE_KEY]: "en-IN" });
  expect(body.data.removedFields).toEqual([LEGACY_KEY]);
  expect(body.data.staleFields).toEqual([]);

  const after = await readSettings(organizationId);
  expect(after.values).toEqual({ [LOCALE_KEY]: "en-IN" });
  expect(after.staleFields).toEqual([]);
});

it.skipIf(!enabled)("preserves install metadata and never returns installedBy", async () => {
  const organizationId = await createTenantWithApp("metadata", {
    code: "App 01",
    name: "Website Builder",
    title: "Website Builder & Headless CMS",
    href: "/sites",
    iconName: "sites",
    description: "Visual canvas studio.",
    permission: "cms:sites:read",
    installedBy: "usr_fixture_operator",
    [LEGACY_KEY]: true,
  });
  const observed = await readSettings(organizationId);
  expect(JSON.stringify(observed)).not.toContain("installedBy");

  const response = await writeSettings(
    organizationId,
    { [DOMAIN_KEY]: true },
    observed.version
  );
  expect(response.status).toBe(200);
  expect(JSON.stringify(await response.json())).not.toContain("installedBy");

  const stored = await fixture.ownerPrisma.installedApp.findFirst({
    where: { organizationId, appId: APP_ID },
    select: { settings: true },
  });
  expect(stored?.settings).toMatchObject({
    code: "App 01",
    name: "Website Builder",
    installedBy: "usr_fixture_operator",
    [DOMAIN_KEY]: true,
  });
});

it.skipIf(!enabled)("returns field-level SETTINGS_INVALID and stores nothing", async () => {
  const organizationId = await createTenantWithApp("invalid", {
    [DOMAIN_KEY]: true,
  });
  const observed = await readSettings(organizationId);

  const response = await writeSettings(
    organizationId,
    { [LOCALE_KEY]: INVALID_LOCALE, [DOMAIN_KEY]: "yes" },
    observed.version
  );

  expect(response.status).toBe(422);
  const problem = await parseProblem(response);
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.SETTINGS_INVALID);
  expect(problem.invalidParams?.map((param) => param.name)).toEqual(
    expect.arrayContaining([LOCALE_KEY, DOMAIN_KEY])
  );

  const after = await readSettings(organizationId);
  expect(after.values).toEqual({ [DOMAIN_KEY]: true });
  expect(after.version).toBe(observed.version);
});

it.skipIf(!enabled)("refuses a stale version without touching the schema state", async () => {
  const organizationId = await createTenantWithApp("conflict", {
    [LEGACY_KEY]: true,
  });
  const observed = await readSettings(organizationId);

  const first = await writeSettings(
    organizationId,
    { [DOMAIN_KEY]: true },
    observed.version
  );
  expect(first.status).toBe(200);

  const stale = await writeSettings(
    organizationId,
    { [DOMAIN_KEY]: false },
    observed.version
  );
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(
    PLATFORM_ERROR_CODE.VERSION_CONFLICT
  );

  const after = await readSettings(organizationId);
  expect(after.values).toEqual({ [DOMAIN_KEY]: true });
  expect(after.staleFields).toEqual([]);
});
