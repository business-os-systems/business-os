import type { MiddlewareHandler } from "hono";
import { getAbusePageUrl } from "../lib/env.js";

/**
 * Every storefront response, including holding and GONE responses, carries the
 * published abuse contact as an RFC 8288 Link. The URL is deployment config,
 * never a hardcoded host.
 */
export function abuseContactLinkMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    const pageUrl = getAbusePageUrl();
    if (pageUrl === null || c.res.headers.has("Link")) {
      return;
    }
    c.header("Link", '<' + pageUrl + '>; rel="abuse-contact"');
  };
}
