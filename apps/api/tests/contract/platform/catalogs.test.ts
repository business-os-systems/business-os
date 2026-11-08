import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { CATALOG_KEYS, PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import { CONTROL_SESSION_COOKIE_NAME } from "@suite/auth/platform";
import {
  platformCatalogsRouter,
  REFERENCE_CATALOG_RATE_LIMIT_KEY,
  REFERENCE_CATALOG_READ_RATE_LIMIT_KEY,
} from "../../../src/routes/admin/catalogs.js";
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
const TEST_CATALOG = "branch_type";
const TEST_VALUES_PATH = "/branch_type/values";

const valueSchema = z
  .object({
    catalogKey: z.string().min(1),
    code: z.string().min(1),
    label: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
    metadata: z.record(z.unknown()),
    version: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const catalogSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().nullable(),
    isSystem: z.boolean(),
    values: z.array(valueSchema),
  })
  .strict();

const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      success: z.literal(true),
      data,
      requestId: z.string().min(1),
      timestamp: z.string(),
    })
    .strict();

let fixture: OperatorFixture;
let managerToken: string;
let limitedToken: string;
const createdValues: { catalogKey: string; code: string }[] = [];

function uniqueTestCode(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

function send(input: {
  readonly method: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
}): Promise<Response> {
  return sendOperatorRequest(platformCatalogsRouter, input);
}

async function createTestValue(label: string): Promise<{
  readonly code: string;
  readonly body: z.infer<typeof valueSchema>;
}> {
  const code = uniqueTestCode("zz_contract");
  const response = await send({
    method: "POST",
    path: TEST_VALUES_PATH,
    token: managerToken,
    body: { code: code.toUpperCase(), label },
  });
  expect(response.status).toBe(200);
  const parsed = envelopeSchema(valueSchema).parse(await response.json());
  createdValues.push({ catalogKey: TEST_CATALOG, code: parsed.data.code });
  return { code, body: parsed.data };
}

function controlPlaneOrigin(): string {
  const value = process.env.CONTROL_PLANE_ORIGIN;
  if (value === undefined || value.trim() === "") {
    throw new Error("CONTROL_PLANE_ORIGIN must be set for catalog tests");
  }
  return value.trim();
}

beforeAll(async () => {
  if (!enabled) return;
  platformCatalogsRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("catalog-contract");
  await clearRateLimitStore(REFERENCE_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(REFERENCE_CATALOG_READ_RATE_LIMIT_KEY);

  await fixture.ownerPrisma.catalog.createMany({
    data: CATALOG_KEYS.map((key) => ({
      key,
      label: key,
      description: null,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  managerToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.CATALOGS_MANAGE.code])).token;
  limitedToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(REFERENCE_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(REFERENCE_CATALOG_READ_RATE_LIMIT_KEY);
});

afterAll(async () => {
  if (!enabled) return;
  if (createdValues.length > 0) {
    await fixture.ownerPrisma.catalogValue.deleteMany({
      where: { OR: createdValues },
    });
  }
  await fixture.cleanup();
});

it.skipIf(!enabled)("lists the catalogs and their values", async () => {
  const response = await send({ method: "GET", path: "/", token: managerToken });

  expect(response.status).toBe(200);
  const parsed = envelopeSchema(z.object({ catalogs: z.array(catalogSchema) }).strict()).parse(
    await response.json(),
  );
  expect(parsed.data.catalogs.length).toBeGreaterThanOrEqual(CATALOG_KEYS.length);
  expect(parsed.data.catalogs.map((catalog) => catalog.key)).toContain("branch_type");
});

it.skipIf(!enabled)("creates a normalized value", async () => {
  const created = await createTestValue("Contract Currency");

  expect(created.body.code).toBe(created.code);
  expect(created.body.catalogKey).toBe("branch_type");
  expect(created.body.version).toBe(1);
  expect(created.body.isActive).toBe(true);
  expect(created.body.metadata).toEqual({});
});

it.skipIf(!enabled)("rejects a duplicate normalized code", async () => {
  const created = await createTestValue("Duplicate Currency");

  const response = await send({
    method: "POST",
    path: TEST_VALUES_PATH,
    token: managerToken,
    body: { code: created.code.toLowerCase(), label: "Duplicate again" },
  });

  expect(response.status).toBe(409);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.DUPLICATE_CODE);
});

it.skipIf(!enabled)("relabels and retires with a version guard", async () => {
  const created = await createTestValue("Before update");

  const updated = await send({
    method: "PATCH",
    path: `/branch_type/values/${created.body.code}`,
    token: managerToken,
    body: {
      label: "After update",
      isActive: false,
      expectedVersion: created.body.version,
    },
  });
  expect(updated.status).toBe(200);
  const parsed = envelopeSchema(valueSchema).parse(await updated.json());
  expect(parsed.data.label).toBe("After update");
  expect(parsed.data.isActive).toBe(false);
  expect(parsed.data.version).toBe(created.body.version + 1);

  const stale = await send({
    method: "PATCH",
    path: `/branch_type/values/${created.body.code}`,
    token: managerToken,
    body: { label: "Stale", expectedVersion: created.body.version },
  });
  expect(stale.status).toBe(409);
  expect((await parseProblem(stale)).code).toBe(PLATFORM_ERROR_CODE.CATALOG_VERSION_CONFLICT);
});

it.skipIf(!enabled)("rejects an invalid code format with field details", async () => {
  const response = await send({
    method: "POST",
    path: TEST_VALUES_PATH,
    token: managerToken,
    body: { code: "a", label: "Too short" },
  });

  expect(response.status).toBe(422);
  const problem = await parseProblem(response);
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.INVALID_CODE_FORMAT);
  expect(problem.invalidParams?.[0]?.name).toBe("code");
});

it.skipIf(!enabled)("rejects an unknown catalog", async () => {
  const response = await send({
    method: "POST",
    path: "/unknown/values",
    token: managerToken,
    body: { code: "USD", label: "Unknown catalog" },
  });

  expect(response.status).toBe(404);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.UNKNOWN_CATALOG);
});

it.skipIf(!enabled)("denies reads and writes without the capability", async () => {
  const read = await send({ method: "GET", path: "/", token: limitedToken });
  expect(read.status).toBe(403);
  expect((await parseProblem(read)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);

  const write = await send({
    method: "POST",
    path: TEST_VALUES_PATH,
    token: limitedToken,
    body: { code: uniqueTestCode("zz_contract"), label: "Denied" },
  });
  expect(write.status).toBe(403);
  expect((await parseProblem(write)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);

  const patch = await send({
    method: "PATCH",
    path: `${TEST_VALUES_PATH}/zz_missing`,
    token: limitedToken,
    body: { label: "Denied", expectedVersion: 1 },
  });
  expect(patch.status).toBe(403);
  expect((await parseProblem(patch)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
});

it.skipIf(!enabled)("rejects forbidden metadata keys and oversized metadata", async () => {
  const metadata: Record<string, string> = {};
  Object.defineProperty(metadata, "__proto__", {
    value: "polluted",
    enumerable: true,
  });

  const forbidden = await send({
    method: "POST",
    path: TEST_VALUES_PATH,
    token: managerToken,
    body: {
      code: uniqueTestCode("zz_forbidden"),
      label: "Forbidden metadata",
      metadata,
    },
  });
  expect(forbidden.status).toBe(422);
  expect((await parseProblem(forbidden)).code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);

  const oversized = await send({
    method: "POST",
    path: TEST_VALUES_PATH,
    token: managerToken,
    body: {
      code: uniqueTestCode("zz_oversized"),
      label: "Oversized metadata",
      metadata: { blob: "x".repeat(4097) },
    },
  });
  expect(oversized.status).toBe(422);
  const problem = await parseProblem(oversized);
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  expect(problem.invalidParams?.some((param) => param.name.startsWith("metadata"))).toBe(true);
});

it.skipIf(!enabled)("does not require an Idempotency-Key for catalog mutations", async () => {
  const response = await platformCatalogsRouter.request(TEST_VALUES_PATH, {
    method: "POST",
    headers: {
      Origin: controlPlaneOrigin(),
      Cookie: `${CONTROL_SESSION_COOKIE_NAME}=${managerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: uniqueTestCode("zz_contract").toLowerCase(),
      label: "No idempotency key",
    }),
  });

  expect(response.status).toBe(200);
  const parsed = envelopeSchema(valueSchema).parse(await response.json());
  createdValues.push({ catalogKey: TEST_CATALOG, code: parsed.data.code });
});
