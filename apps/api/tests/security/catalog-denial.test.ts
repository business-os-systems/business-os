import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
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

const MISSING_ITEM = "catalog_item_missing";

interface RouteCase {
  readonly method: string;
  readonly path: string;
  readonly body?: Record<string, unknown>;
}

/** Every catalog route, exercised with a body that is valid enough to pass
 * validation so a 403 can only come from the capability guard. */
function createRoute(): RouteCase {
  return {
    method: "POST",
    path: "/items",
    body: {
      kind: "SECTION",
      name: "Denial hero",
      slug: "denial-hero-" + fixture.suffix,
      category: "hospitality",
      definition: {
        schemaVersion: "2026-03",
        block: {
          id: "blk_denial",
          type: "hero",
          props: { headline: "Denial" },
        },
      },
    },
  };
}

function catalogRoutes(): readonly RouteCase[] {
  return [
    { method: "GET", path: "/items" },
    { method: "GET", path: "/items/" + MISSING_ITEM },
    { method: "GET", path: "/items/" + MISSING_ITEM + "/versions" },
    createRoute(),
    {
      method: "PATCH",
      path: "/items/" + MISSING_ITEM,
      body: { expectedVersion: 1, name: "Denied" },
    },
    { method: "POST", path: "/items/" + MISSING_ITEM + "/versions" },
    { method: "POST", path: "/items/" + MISSING_ITEM + "/preview" },
    {
      method: "POST",
      path: "/items/" + MISSING_ITEM + "/publish",
      body: { version: 1 },
    },
    { method: "POST", path: "/items/" + MISSING_ITEM + "/deprecate" },
    { method: "POST", path: "/items/" + MISSING_ITEM + "/disable" },
    { method: "POST", path: "/items/" + MISSING_ITEM + "/retire" },
  ];
}

const AUTHOR_ROUTES: readonly RouteCase[] = [
  { method: "POST", path: "/items/" + MISSING_ITEM + "/versions" },
  {
    method: "PATCH",
    path: "/items/" + MISSING_ITEM,
    body: { expectedVersion: 1, name: "Denied" },
  },
];

/** FR-092: a publish grant implies preview, so both roles reach this handler. */
const PREVIEW_ROUTES: readonly RouteCase[] = [
  { method: "POST", path: "/items/" + MISSING_ITEM + "/preview" },
];

const PUBLISH_ROUTES: readonly RouteCase[] = [
  {
    method: "POST",
    path: "/items/" + MISSING_ITEM + "/publish",
    body: { version: 1 },
  },
  { method: "POST", path: "/items/" + MISSING_ITEM + "/deprecate" },
  { method: "POST", path: "/items/" + MISSING_ITEM + "/disable" },
  { method: "POST", path: "/items/" + MISSING_ITEM + "/retire" },
];

let fixture: OperatorFixture;
let readToken: string;
let authorToken: string;
let publishToken: string;
let limitedToken: string;

function send(route: RouteCase, token?: string): Promise<Response> {
  return sendOperatorRequest(websiteBuilderCatalogRouter, {
    method: route.method,
    path: route.path,
    token,
    body: route.body,
  });
}

async function expectCapabilityDenied(route: RouteCase, token: string): Promise<void> {
  const response = await send(route, token);
  expect(response.status, route.method + " " + route.path).toBe(403);
  expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
}

/**
 * A granted route must reach its own handler: a missing item is a 404, never a
 * 403 and never a 5xx, so a capability bypass cannot hide behind an error path.
 */
async function expectReachedHandler(
  route: RouteCase,
  token: string,
  expectedStatus: number,
): Promise<void> {
  const response = await send(route, token);
  expect(response.status, route.method + " " + route.path).toBe(expectedStatus);
}

beforeAll(async () => {
  if (!enabled) return;
  websiteBuilderCatalogRouter.onError(globalErrorHandler);
  fixture = await createOperatorFixture("catalog-denial");
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY);

  readToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_READ.code])).token;
  authorToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_AUTHOR.code])).token;
  publishToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.APPS_PUBLISH.code])).token;
  limitedToken = (await fixture.createOperator([PLATFORM_CAPABILITIES.TENANTS_READ.code])).token;
});

beforeEach(async () => {
  if (!enabled) return;
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_READ_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_RATE_LIMIT_KEY);
  await clearRateLimitStore(WEBSITE_BUILDER_CATALOG_PUBLISH_RATE_LIMIT_KEY);
  const prefix = "denial-hero-" + fixture.suffix;
  await fixture.ownerPrisma.cmsCatalogItemVersion.deleteMany({
    where: { item: { slug: { startsWith: prefix } } },
  });
  await fixture.ownerPrisma.cmsCatalogItem.deleteMany({
    where: { slug: { startsWith: prefix } },
  });
});

afterAll(async () => {
  if (!enabled) return;
  await fixture.cleanup();
});

it.skipIf(!enabled)("denies every catalog route without authentication", async () => {
  await Promise.all(
    catalogRoutes().map(async (route) => {
      const response = await send(route);
      expect(response.status, route.method + " " + route.path).toBe(401);
      expect((await parseProblem(response)).code).toBe(PLATFORM_ERROR_CODE.AUTH_REQUIRED);
    }),
  );
});

it.skipIf(!enabled)("denies every catalog route without a catalog capability", async () => {
  await Promise.all(catalogRoutes().map((route) => expectCapabilityDenied(route, limitedToken)));
});

it.skipIf(!enabled)("lets a read-only operator read but never author or publish", async () => {
  await expectReachedHandler({ method: "GET", path: "/items" }, readToken, 200);
  await expectReachedHandler({ method: "GET", path: "/items/" + MISSING_ITEM }, readToken, 404);
  await expectReachedHandler(
    { method: "GET", path: "/items/" + MISSING_ITEM + "/versions" },
    readToken,
    404,
  );

  await Promise.all(
    [...AUTHOR_ROUTES, ...PREVIEW_ROUTES, ...PUBLISH_ROUTES].map((route) =>
      expectCapabilityDenied(route, readToken),
    ),
  );

  const create = await send(createRoute(), readToken);
  expect(create.status).toBe(403);
  expect((await parseProblem(create)).code).toBe(PLATFORM_ERROR_CODE.CAPABILITY_DENIED);
});

it.skipIf(!enabled)("lets an author author but never publish", async () => {
  const read = await send({ method: "GET", path: "/items" }, authorToken);
  expect(read.status).toBe(200);

  const create = await send(createRoute(), authorToken);
  expect(create.status).toBe(201);
  const created = z
    .object({ data: z.object({ id: z.string(), slug: z.string() }) })
    .parse(await create.json());
  try {
    await Promise.all(
      [...AUTHOR_ROUTES, ...PREVIEW_ROUTES].map((route) =>
        expectReachedHandler(route, authorToken, 404),
      ),
    );
    await Promise.all(PUBLISH_ROUTES.map((route) => expectCapabilityDenied(route, authorToken)));
  } finally {
    await fixture.ownerPrisma.cmsCatalogItemVersion.deleteMany({
      where: { itemId: created.data.id },
    });
    await fixture.ownerPrisma.cmsCatalogItem.deleteMany({
      where: { id: created.data.id },
    });
  }
});

it.skipIf(!enabled)("lets a publisher publish but never author", async () => {
  const read = await send({ method: "GET", path: "/items" }, publishToken);
  expect(read.status).toBe(200);

  await Promise.all(AUTHOR_ROUTES.map((route) => expectCapabilityDenied(route, publishToken)));
  await expectCapabilityDenied(createRoute(), publishToken);

  await Promise.all(
    [...PREVIEW_ROUTES, ...PUBLISH_ROUTES].map((route) =>
      expectReachedHandler(route, publishToken, 404),
    ),
  );
});
