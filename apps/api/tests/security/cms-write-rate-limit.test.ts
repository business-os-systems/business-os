import { beforeAll, describe, expect, it } from "vitest";
import "../helpers/auth.js";
import { globalErrorHandler } from "../../src/middleware/error-handler.js";
import { clearRateLimitStore } from "../../src/middleware/rate-limit.js";
import {
  CMS_WRITE_RATE_LIMIT_KEY,
  CMS_WRITE_RATE_LIMIT_PER_MINUTE,
  createCmsRouter,
} from "../../src/routes/cms/index.js";

const FORWARDED_FOR = "203.0.113.78";

describe("CMS write rate limiting (FR-061, T161, T091)", () => {
  beforeAll(async () => {
    await clearRateLimitStore(CMS_WRITE_RATE_LIMIT_KEY);
  });

  it("rejects a write past the documented budget with RFC 7807 problem details", async () => {
    const router = createCmsRouter();
    router.onError(globalErrorHandler);
    const init: RequestInit = {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": FORWARDED_FOR,
      },
      body: JSON.stringify({ expectedRevision: 1, draftAst: {} }),
    };

    const allowed = await Promise.all(
      Array.from({ length: CMS_WRITE_RATE_LIMIT_PER_MINUTE }, () =>
        Promise.resolve(router.request("/pages/page_rate_limit/content", init)),
      ),
    );
    expect(allowed.every((response) => response.status === 401)).toBe(true);

    const limited = await router.request("/pages/page_rate_limit/content", init);
    expect(limited.status).toBe(429);
    const problem = (await limited.json()) as { code: string; type: string; status: number };
    expect(problem.status).toBe(429);
    expect(problem.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(problem.type).toBe("/errors/rate-limit-exceeded");
  });

  it("does not spend the write budget on reads", async () => {
    const router = createCmsRouter();
    router.onError(globalErrorHandler);
    const headers = { "x-forwarded-for": FORWARDED_FOR };
    const read = await router.request("/sites", { headers });
    expect(read.status).toBe(401);
  });
});
