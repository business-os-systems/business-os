import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import { PLATFORM_CAPABILITIES, PLATFORM_ERROR_CODE } from "@suite/core";
import {
  WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY,
  WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY,
  WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY,
  websiteBuilderCatalogRouter,
} from "../../src/routes/admin/app-catalog.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../src/middleware/rate-limit.js";
import { loadPlatformTestEnv } from "../helpers/platform-env.js";
import {
  createOperatorFixture,
  parseProblem,
  platformOperatorTestsEnabled,
  sendOperatorRequest,
  type OperatorFixture,
} from "../helpers/platform-operators.js";

loadPlatformTestEnv();

const enabled = platformOperatorTestsEnabled();

/**
 * An independent wire schema: the route's own Zod schema is exercised by the
 * OpenAPI layer, while this one proves the success envelope did not drift.
 */
const successEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z.unknown(),
    requestId: z.string().min(1),
    timestamp: z.string().datetime(),
  })
  .strict();

const catalogItemWireSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["SECTION", "TEMPLATE", "THEME"]),
    scope: z.enum(["GLOBAL", "TENANT"]),
    organizationId: z.string().nullable(),
    name: z.string().min(1),
    slug: z.string().min(1),
    category: z.string().min(1),
    industries: z.array(z.string()),
    definition: z.record(z.unknown()),
    previewRef: z.string().nullable(),
    flagKey: z.string().nullable(),
    targeting: z
      .object({
        plans: z.array(z.string()),
        industries: z.array(z.string()),
        orgAllowlist: z.array(z.string()),
        orgDenylist: z.array(z.string()),
      })
      .strict(),
    status: z.enum(["DRAFT", "ACTIVE", "DEPRECATED", "DISABLED", "RETIRED"]),
    contractVersion: z.string().min(1),
    currentVersion: z.number().int().nonnegative(),
    draftVersion: z.number().int().positive().nullable(),
    concurrencyVersion: z.number().int().positive(),
    previewedAt: z.string().datetime().nullable(),
    publishedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

const ITEM_NAME = "Contract hero";

const SECTION_DEFINITION = {
  schemaVersion: "2026-03",
  block: {
    id: "blk_hero_contract",
    type: "hero",
    props: { headline: ITEM_NAME },
  },
};

let fixture: OperatorFixture;
let readToken: string;
let authorToken: string;
let publishToken: string;
let slugCounter = 0;

function uniqueSlug(): string {
  slugCounter += 1;
  return "catalog-contract-" + fixture.suffix + "-" + String(slugCounter);
}

function send(input: Parameters<typeof sendOperatorRequest>[1]): Promise<Response> {
  return sendOperatorRequest(websiteBuilderCatalogRouter, input);
}

async function createDraft(): Promise<{ id: string; concurrencyVersion: number }> {
  const response = await send({
    method: "POST",
    path: "/items",
    token: authorToken,
    body: {
      kind: "SECTION",
      name: ITEM_NAME,
      slug: uniqueSlug(),
      category: "hospitality",
      definition: SECTION_DEFINITION,
    },
  });
  expect(response.status).toBe(201);
  const body = successEnvelopeSchema
    .extend({ data: catalogItemWireSchema })
    .parse(await response.json());
  return {
    id: body.data.id,
    concurrencyVersion: body.data.concurrencyVersion,
  };
}

async function cleanupCatalogRows(): Promise<void> {
  const prefix = "catalog-contract-" + fixture.suffix;
  await fixture.ownerPrisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: prefix } } },
  });
  await fixture.ownerPrisma.cmsCatalogItem.deleteMany({
    where: { slug: { startsWith: prefix } },
  });
}

beforeAll(async () => {
  if (!enabled) return;
  websiteBuilderCatalogRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("catalog-contract");
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY);

  readToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_READ.code])).token;
  authorToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_AUTHOR.code])).token;
  publishToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_PUBLISH.code])).token;
});

afterAll(async () => {
  if (!enabled) return;
  await cleanupCatalogRows();
  await fixture.cleanup();
});

it.skipIf(!enabled)("returns the shared success envelope for a list", async () => {
  const response = await send({
    method: "GET",
    path: "/items",
    token: readToken,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");

  const body = successEnvelopeSchema
    .extend({
      data: z
        .object({
          items: z.array(catalogItemWireSchema),
          nextCursor: z.string().nullable(),
        })
        .strict(),
    })
    .parse(await response.json());
  expect(body.success).toBe(true);
  expect(Array.isArray(body.data.items)).toBe(true);
});

it.skipIf(!enabled)("returns the shared success envelope for a created item", async () => {
  const response = await send({
    method: "POST",
    path: "/items",
    token: authorToken,
    body: {
      kind: "SECTION",
      name: ITEM_NAME,
      slug: uniqueSlug(),
      category: "hospitality",
      definition: SECTION_DEFINITION,
    },
  });
  expect(response.status).toBe(201);
  const body = successEnvelopeSchema
    .extend({ data: catalogItemWireSchema })
    .parse(await response.json());
  expect(body.data.status).toBe("DRAFT");
});

it.skipIf(!enabled)("renders an unknown item as RFC 7807 problem details", async () => {
  const response = await send({
    method: "GET",
    path: "/items/item_does_not_exist",
    token: readToken,
  });
  expect(response.status).toBe(404);
  const problem = await parseProblem(response);
  expect(problem.type).toBe("/errors/not-found");
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.NOT_FOUND);
  expect(problem.status).toBe(404);
  expect(problem.title.length).toBeGreaterThan(0);
  expect(problem.detail.length).toBeGreaterThan(0);
  expect(problem.instance).toBeTruthy();
  expect(problem.timestamp).toBeTruthy();
});

it.skipIf(!enabled)("renders a missing preview as PREVIEW_REQUIRED", async () => {
  const item = await createDraft();
  const response = await send({
    method: "POST",
    path: "/items/" + item.id + "/publish",
    token: publishToken,
    body: { version: 1 },
  });
  expect(response.status).toBe(409);
  const problem = await parseProblem(response);
  expect(problem.type).toBe("/errors/preview-required");
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.PREVIEW_REQUIRED);
  expect(problem.status).toBe(409);
});

it.skipIf(!enabled)("renders a validation failure with invalid params", async () => {
  const response = await send({
    method: "POST",
    path: "/items",
    token: authorToken,
    body: {
      kind: "SECTION",
      name: ITEM_NAME,
      slug: uniqueSlug(),
      category: "hospitality",
      definition: {
        schemaVersion: "2026-03",
        block: {
          id: "blk_hero_contract",
          type: "hero",
          props: { headline: ITEM_NAME },
          unexpected: true,
        },
      },
    },
  });
  expect(response.status).toBe(422);
  const problem = await parseProblem(response);
  expect(problem.type).toBe("/errors/validation-failed");
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
  expect(problem.invalidParams?.length ?? 0).toBeGreaterThan(0);
});

it.skipIf(!enabled)("renders a stale draft edit as VERSION_CONFLICT", async () => {
  const item = await createDraft();
  const response = await send({
    method: "PATCH",
    path: "/items/" + item.id,
    token: authorToken,
    body: { expectedVersion: item.concurrencyVersion + 50, name: "Stale" },
  });
  expect(response.status).toBe(409);
  const problem = await parseProblem(response);
  expect(problem.type).toBe("/errors/version-conflict");
  expect(problem.code).toBe(PLATFORM_ERROR_CODE.VERSION_CONFLICT);
});

it.skipIf(!enabled)("rejects an undeclared publish property", async () => {
  const item = await createDraft();
  const response = await send({
    method: "POST",
    path: "/items/" + item.id + "/publish",
    token: publishToken,
    body: { version: 1, unexpected: true },
  });
  expect(response.status).toBe(422);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.VALIDATION_FAILED);
});
