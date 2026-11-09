import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { z } from "zod";
import { CATALOG_KEYS } from "@suite/core";
import { SESSION_COOKIE_NAME } from "@suite/auth/session";
import { createCatalogCache, redis } from "@suite/redis";
import {
  referenceRouter,
  REFERENCE_CACHE_CONTROL,
  REFERENCE_READ_RATE_LIMIT_KEY,
} from "../../../src/routes/reference.js";
import { globalErrorHandler } from "../../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../../helpers/platform-env.js";
import { createTestSessionToken } from "../../helpers/auth.js";
import {
  createOperatorFixture,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();

const valueSchema = z
  .object({
    code: z.string().min(1),
    label: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    metadata: z.record(z.unknown()),
  })
  .strict();

const catalogSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    description: z.string().nullable(),
    values: z.array(valueSchema),
  })
  .strict();

const envelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      success: z.literal(true),
      data,
      requestId: z.string().min(1),
      timestamp: z.string().min(1),
    })
    .strict();

const listEnvelopeSchema = envelopeSchema(
  z.object({ catalogs: z.array(catalogSchema), asOf: z.string().datetime() }).strict(),
);
const catalogEnvelopeSchema = envelopeSchema(
  z.object({ catalog: catalogSchema, asOf: z.string().datetime() }).strict(),
);

let fixture: OperatorFixture;
const createdValues: { catalogKey: string; code: string }[] = [];

function uniqueTestCode(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString("hex")}`;
}

async function tenantCookie(): Promise<string> {
  const token = await createTestSessionToken({
    organizationId: "org_reference_contract",
  });
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
}

function read(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(referenceRouter.request(path, { headers }));
}

async function createCatalogValue(input: { readonly isActive: boolean }): Promise<string> {
  const code = uniqueTestCode("zz_reference");
  await fixture.ownerPrisma.catalogValue.create({
    data: {
      catalogKey: "branch_type",
      code,
      label: `Contract ${code}`,
      isActive: input.isActive,
    },
  });
  createdValues.push({ catalogKey: "branch_type", code });
  return code;
}

beforeAll(async () => {
  if (!enabled) return;
  referenceRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("reference-read-contract");
  await fixture.ownerPrisma.catalog.createMany({
    data: CATALOG_KEYS.map((key) => ({
      key,
      label: key,
      description: null,
      isSystem: true,
    })),
    skipDuplicates: true,
  });
});

const catalogCache = createCatalogCache(redis);

/** The cache is process-wide, so every case starts from a cold catalog. */
async function clearReferenceCatalogCache(): Promise<void> {
  await Promise.all(CATALOG_KEYS.map((key) => catalogCache.invalidate(key)));
  await catalogCache.invalidate(null);
}

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(REFERENCE_READ_RATE_LIMIT_KEY);
  await clearReferenceCatalogCache();
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

it.skipIf(!enabled)("rejects an unauthenticated read", async () => {
  const response = await read("/catalogs");

  expect(response.status).toBe(401);
  expect(response.headers.get("Content-Type")).toContain("application/problem+json");
});

it.skipIf(!enabled)("returns every catalog to a tenant session", async () => {
  const response = await read("/catalogs", { Cookie: await tenantCookie() });

  expect(response.status).toBe(200);
  const parsed = listEnvelopeSchema.parse(await response.json());
  expect(parsed.data.catalogs.map((catalog) => catalog.key)).toEqual(
    expect.arrayContaining([...CATALOG_KEYS]),
  );
  expect(parsed.data.asOf).toBeDefined();
});

it.skipIf(!enabled)("returns only active values and never a retired one", async () => {
  const activeCode = await createCatalogValue({ isActive: true });
  const retiredCode = await createCatalogValue({ isActive: false });

  const response = await read("/catalogs/branch_type", {
    Cookie: await tenantCookie(),
  });

  expect(response.status).toBe(200);
  const parsed = catalogEnvelopeSchema.parse(await response.json());
  const codes = parsed.data.catalog.values.map((value) => value.code);
  expect(codes).toContain(activeCode);
  expect(codes).not.toContain(retiredCode);
});

it.skipIf(!enabled)("serves the catalog to an operator control session", async () => {
  const operator = await fixture.createOperator([]);

  const response = await sendOperatorRequest(referenceRouter, {
    method: "GET",
    path: "/catalogs/branch_type",
    token: operator.token,
  });

  expect(response.status).toBe(200);
  const parsed = catalogEnvelopeSchema.parse(await response.json());
  expect(parsed.data.catalog.key).toBe("branch_type");
});

it.skipIf(!enabled)("rejects an unknown catalog key with 404", async () => {
  const response = await read("/catalogs/not_a_catalog", {
    Cookie: await tenantCookie(),
  });

  expect(response.status).toBe(404);
  const problem = z
    .object({ code: z.string(), type: z.string() })
    .passthrough()
    .parse(await response.json());
  expect(problem.code).toBe("UNKNOWN_CATALOG");
  expect(problem.type).toBe("/errors/unknown-catalog");
});

it.skipIf(!enabled)("declares the 60-second cache and a strong ETag", async () => {
  const response = await read("/catalogs", { Cookie: await tenantCookie() });

  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe(REFERENCE_CACHE_CONTROL);
  expect(response.headers.get("ETag")).toMatch(/^"[0-9a-f]{64}"$/);
});

it.skipIf(!enabled)("answers a matching If-None-Match with 304", async () => {
  const first = await read("/catalogs", { Cookie: await tenantCookie() });
  const etag = first.headers.get("ETag");
  expect(etag).not.toBeNull();

  const second = await read("/catalogs", {
    Cookie: await tenantCookie(),
    "If-None-Match": String(etag),
  });

  expect(second.status).toBe(304);
  expect(await second.text()).toBe("");
});

it.skipIf(!enabled)("exposes no mutation route on the reference path", async () => {
  const response = await referenceRouter.request("/catalogs", {
    method: "POST",
    headers: { Cookie: await tenantCookie(), "Content-Type": "application/json" },
    body: JSON.stringify({ code: "zz_new", label: "New" }),
  });

  expect(response.status).toBe(404);
});
