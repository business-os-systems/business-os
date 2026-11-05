import type { Context, MiddlewareHandler } from "hono";
import { ForbiddenError } from "@suite/core/errors";
import { AUTH_ERROR_CODES } from "@suite/auth";
import { getControlPlaneOrigin } from "../lib/platform-env.js";

const READ_ONLY_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** `none` is a typed URL or bookmark; `same-origin` is the application itself. */
const SAME_ORIGIN_FETCH_SITES: ReadonlySet<string> = new Set([
  "same-origin",
  "none",
]);

/**
 * Browsers omit Origin on same-origin reads but still send Sec-Fetch-Site.
 * Only that exact pair is exempt, so a cross-site request cannot ride the
 * exemption, and every state-changing method keeps the strict Origin check.
 */
function assertControlPlaneOrigin(c: Context): void {
  const origin = c.req.header("origin");
  if (origin === getControlPlaneOrigin()) {
    return;
  }

  const fetchSite = c.req.header("sec-fetch-site");
  const isSameOriginRead =
    origin === undefined &&
    READ_ONLY_METHODS.has(c.req.method) &&
    fetchSite !== undefined &&
    SAME_ORIGIN_FETCH_SITES.has(fetchSite);
  if (isSameOriginRead) {
    return;
  }

  throw new ForbiddenError("Origin not allowed.", {
    code: AUTH_ERROR_CODES.CORS_ORIGIN_DENIED,
  });
}

export const controlPlaneOriginGuard: MiddlewareHandler = async (c, next) => {
  assertControlPlaneOrigin(c);
  await next();
};
