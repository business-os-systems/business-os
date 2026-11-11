import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_ERROR_CODE,
  problemTypeForErrorCode,
} from "@suite/core";
import {
  QUOTA_RATE_LIMIT_KEY,
  QUOTA_READ_RATE_LIMIT_KEY,
  platformQuotasRouter,
} from "../../../src/routes/admin/quotas.js";
import { quotaListSchema } from "../../../src/services/admin/quota.contract.js";
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
const EMAIL_PREFIX = "quota-contract";

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
  return sendOperatorRequest(platformQuotasRouter, input);
}

async function createTenant(label: string): Promise<string> {
  const organization = await fixture.ownerPrisma.organization.create({
    data: {
      name: `Quota ${label} ${fixture.suffix}`,
      slug: `quota-${label}-${fixture.suffix}`,
    },
  });
  organizationIds.push(organization.id);
  return organization.id;
}

beforeAll(async () => {
  if (!enabled) return;
  platformQuotasRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture(EMAIL_PREFIX);
  await clearRateLimitStore(QUOTA_RATE_LIMIT_KEY);
  await clearRateLimitStore(QUOTA_READ_RATE_LIMIT_KEY);
  managerToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.QUOTAS_MANAGE.code])
  ).token;
  limitedToken = (
    await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])
  ).token;
});

afterAll(async () => {
  if (!enabled) return;
  if (organizationIds.length > 0) {
    await fixture.ownerPrisma.quota.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.auditEvent.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await fixture.ownerPrisma.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
  }
  await fixture.cleanup();
});

it.skipIf(!enabled)("keeps the empty quota list envelope", async () => {
  const organizationId = await createTenant("empty");

  const response = await send({
    method: "GET",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(quotaListSchema).parse(await response.json());
  expect(body.data.items).toEqual([]);
});

it.skipIf(!enabled)("keeps the quota item contract with usage and version", async () => {
  const organizationId = await createTenant("item");

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
    body: {
      items: [
        {
          resourceKey: "core.branches",
          limitValue: "5",
          isEnforced: true,
          expectedVersion: null,
        },
      ],
    },
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(quotaListSchema).parse(await response.json());
  expect(body.data.items).toHaveLength(1);
  const item = body.data.items[0];
  expect(item?.resourceKey).toBe("core.branches");
  expect(item?.limitValue).toBe("5");
  expect(item?.unit).toBe("count");
  expect(item?.currentValue).toBe("0");
  expect(item?.isMeasurable).toBe(true);
  expect(item?.isEnforced).toBe(true);
  expect(item?.version).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

it.skipIf(!enabled)("keeps the measured storage quota envelope", async () => {
  const organizationId = await createTenant("storage");

  const response = await send({
    method: "PUT",
    path: `/tenants/${organizationId}/quotas`,
    token: managerToken,
    body: {
      items: [
        {
          resourceKey: "media.storage",
          limitValue: "1024",
          isEnforced: false,
          expectedVersion: null,
        },
      ],
    },
  });

  expect(response.status).toBe(200);
  const body = envelopeSchema(quotaListSchema).parse(await response.json());
  const item = body.data.items[0];
  expect(item?.limitValue).toBe("1024");
  expect(item?.unit).toBe("bytes");
  expect(item?.currentValue).toBe("0");
  expect(item?.isMeasurable).toBe(true);
  expect(item?.isOverLimit).toBe(false);
  expect(item?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

function quotaBody(
  resourceKey: string,
  limitValue: string,
  isEnforced: boolean,
  expectedVersion: string | null
) {
  return {
    items: [{ resourceKey, limitValue, isEnforced, expectedVersion }],
  };
}

function denialCases(path: string) {
  return [
    {
      request: { method: "GET", path },
      status: 401,
      code: PLATFORM_ERROR_CODE.AUTH_REQUIRED,
    },
    {
      request: { method: "GET", path, token: limitedToken },
      status: 403,
      code: PLATFORM_ERROR_CODE.CAPABILITY_DENIED,
    },
    {
      request: {
        method: "PUT",
        path,
        token: managerToken,
        body: quotaBody("unknown.resource", "1", true, null),
      },
      status: 422,
      code: PLATFORM_ERROR_CODE.UNKNOWN_RESOURCE_KEY,
    },
    {
      request: {
        method: "GET",
        path: "/tenants/tenant_missing_probe/quotas",
        token: managerToken,
      },
      status: 404,
      code: PLATFORM_ERROR_CODE.TENANT_NOT_FOUND,
    },
    {
      request: {
        method: "PUT",
        path,
        token: managerToken,
        body: quotaBody("core.members", "9", true, "stale"),
      },
      status: 409,
      code: PLATFORM_ERROR_CODE.QUOTA_CONFLICT,
    },
  ] as const;
}

it.skipIf(!enabled)("keeps the RFC 7807 contract for denied requests", async () => {
  const organizationId = await createTenant("errors");
  const path = `/tenants/${organizationId}/quotas`;

  const created = await send({
    method: "PUT",
    path,
    token: managerToken,
    body: quotaBody("core.members", "3", true, null),
  });
  expect(created.status).toBe(200);

  const cases = denialCases(path);

  const results = await Promise.all(
    cases.map(async (testCase) => {
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
