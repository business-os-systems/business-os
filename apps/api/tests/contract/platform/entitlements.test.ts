import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  problemTypeForErrorCode,
} from "@suite/core";
import { platformEntitlementsRouter } from "../../../src/routes/admin/entitlements.js";
import {
  ENTITLEMENT_RATE_LIMIT_KEY,
  ENTITLEMENT_READ_RATE_LIMIT_KEY,
} from "../../../src/routes/admin/entitlements.js";
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
const EMAIL_PREFIX = "entitlement-contract";
const APP_ID = "website-builder";

const branchOverrideSchema = z
  .object({ branchId: z.string(), isEnabled: z.boolean() })
  .strict();

const entitlementAppSchema = z
  .object({
    appId: z.string().min(1),
    isEnabled: z.boolean(),
    installedAt: z.string().datetime(),
    version: z.string().min(1),
    branchOverrides: z.array(branchOverrideSchema),
  })
  .strict();

const entitlementListSchema = z
  .object({ apps: z.array(entitlementAppSchema) })
  .strict();

const settingsFieldSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().min(1),
    required: z.boolean(),
    kind: z.enum(["boolean", "text"]),
  })
  .passthrough();

const settingsViewSchema = z
  .object({
    appId: z.string().min(1),
    schema: z.object({ fields: z.array(settingsFieldSchema) }).strict(),
    values: z.record(z.unknown()),
    staleFields: z.array(
      z.object({ name: z.string(), reason: z.string() }).strict()
    ),
    version: z.string().min(1),
  })
  .strict();

const settingsWriteResultSchema = z
  .object({
    appId: z.string().min(1),
    values: z.record(z.unknown()),
    removedFields: z.array(z.string()),
    staleFields: z.array(
      z.object({ name: z.string(), reason: z.string() }).strict()
    ),
    version: z.string().min(1),
  })
  .strict();

const updateEntitlementBodySchema = z
  .object({
    appId: z.string().min(1),
    enabled: z.boolean(),
    expectedVersion: z.string().min(1),
  })
  .strict();

function envelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z
    .object({
      success: z.literal(true),
      data,
      requestId: z.string().min(1),
      timestamp: z.string().datetime(),
    })
    .strict();
}

function requireVersion(value: string | undefined): string {
  if (value === undefined) {
    throw new Error("The entitlement response did not carry a version.");
  }
  return value;
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
}): Promise<Response> {
  return sendOperatorRequest(platformEntitlementsRouter, input);
}

async function createTenantWithApp(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Contract ${label} ${fixture.suffix}`,
      slug: `contract-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  await fixture.ownerPrisma.installedApp.create({
    data: { organizationId: organization.id, appId: APP_ID },
  });
  return organization.id;
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
  limitedToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])
  ).token;
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

it.skipIf(!enabled)("keeps the entitlement envelope and hides settings", async () => {
  const organizationId = await createTenantWithApp("list");

  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(entitlementListSchema).parse(
    await response.json()
  );
  expect(body.data.apps).toHaveLength(1);
  expect(body.data.apps[0]?.appId).toBe(APP_ID);
  expect(JSON.stringify(body)).not.toContain("settings");
});

it.skipIf(!enabled)("keeps the settings schema and values contract", async () => {
  const organizationId = await createTenantWithApp("settings");

  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(settingsViewSchema).parse(await response.json());
  const keys = body.data.schema.fields.map((field) => field.key);
  expect(keys).toEqual(["customDomainEnabled", "defaultLocale"]);
  expect(body.data.values).toEqual({});
  expect(body.data.staleFields).toEqual([]);
});

it.skipIf(!enabled)("keeps the entitlement write envelope", async () => {
  const organizationId = await createTenantWithApp("write-envelope");
  const read = await send({
    method: "GET",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
  });
  const observed = envelopeSchema(entitlementListSchema).parse(await read.json());

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/entitlements`,
    token: managerToken,
    body: updateEntitlementBodySchema.parse({
      appId: APP_ID,
      enabled: false,
      expectedVersion: requireVersion(observed.data.apps[0]?.version),
    }),
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(entitlementListSchema).parse(await response.json());
  expect(body.data.apps[0]?.isEnabled).toBe(false);
  expect(body.data.apps[0]?.version).not.toBe(observed.data.apps[0]?.version);
});

it.skipIf(!enabled)("keeps the settings write envelope with removed fields", async () => {
  const organizationId = await createTenantWithApp("write-settings");

  const read = await send({
    method: "GET",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
  });
  const observed = envelopeSchema(settingsViewSchema).parse(await read.json());

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/apps/${APP_ID}/settings`,
    token: managerToken,
    body: {
      values: { customDomainEnabled: true },
      expectedVersion: observed.data.version,
    },
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(settingsWriteResultSchema).parse(
    await response.json()
  );
  expect(body.data.values).toEqual({ customDomainEnabled: true });
  expect(body.data.removedFields).toEqual([]);
  expect(body.data.staleFields).toEqual([]);
  expect(body.data.version).not.toBe(observed.data.version);
});

function denialCases(organizationId: string) {
  const entitlementsPath = `/tenants/${organizationId}/entitlements`;
  const settingsPath = `/tenants/${organizationId}/apps/${APP_ID}/settings`;
  return [
    {
      request: { method: "GET", path: entitlementsPath },
      status: 401,
      code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    },
    {
      request: { method: "GET", path: entitlementsPath, token: limitedToken },
      status: 403,
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
    },
    {
      request: {
        method: "PUT",
        path: entitlementsPath,
        token: managerToken,
        body: { appId: APP_ID, enabled: false },
      },
      status: 422,
      code: PLATFORM_ERROR_CODE.VALIDATION_FAILED,
    },
    {
      request: {
        method: "GET",
        path: "/tenants/tenant_missing_probe/entitlements",
        token: managerToken,
      },
      status: 404,
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    },
    {
      request: {
        method: "PUT",
        path: settingsPath,
        token: managerToken,
        body: { values: { unknownSetting: true }, expectedVersion: "stale" },
      },
      status: 422,
      code: PLATFORM_ERROR_CODE.SETTINGS_INVALID,
    },
  ] as const;
}

it.skipIf(!enabled)("keeps the RFC 7807 contract for denied requests", async () => {
  const organizationId = await createTenantWithApp("errors");
  const results = await Promise.all(
    denialCases(organizationId).map(async (testCase) => {
      const response = await send(testCase.request);
      return { testCase, response, problem: await parseProblem(response) };
    })
  );

  for (const { testCase, response, problem } of results) {
    expect(response.status).toBe(testCase.status);
    expect(problem.code).toBe(testCase.code);
    expect(problem.type).toBe(problemTypeForErrorCode(testCase.code));
  }
});
