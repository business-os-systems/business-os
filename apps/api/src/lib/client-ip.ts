import type { Context, MiddlewareHandler } from "hono";
import { getConnInfo } from "@hono/node-server/conninfo";
import { getTrustedProxyIps, isTest } from "./env.js";

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    return undefined;
  }
}

/**
 * Resolves the client address used for rate limiting and forensic fields.
 *
 * A forwarded header is client-controlled, so it is honoured only when the
 * socket peer is a declared trusted proxy; otherwise an attacker could write a
 * chosen IP into the rate-limit key or an impersonation record (CWE-348).
 */
const CLIENT_IP_CONTEXT_KEY = "clientIp";

/** Stores the resolved client address for OpenAPI route handlers. */
export const clientIpMiddleware: MiddlewareHandler = async (c, next) => {
  c.set(CLIENT_IP_CONTEXT_KEY, resolveClientIp(c));
  await next();
};

export function readClientIp(c: { get: (key: string) => unknown }): string {
  const value = c.get(CLIENT_IP_CONTEXT_KEY);
  return typeof value === "string" ? value : "0.0.0.0";
}

export function resolveClientIp(c: Context): string {
  const socketIp = socketAddress(c);
  const trustedProxies = new Set(getTrustedProxyIps());
  const trustForwardedHeaders =
    isTest || (socketIp !== undefined && trustedProxies.has(socketIp));

  if (trustForwardedHeaders) {
    const cfConnectingIp = c.req.header("cf-connecting-ip");
    if (cfConnectingIp) return cfConnectingIp.trim();

    const forwardedFor = c.req.header("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      if (firstIp) return firstIp;
    }

    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp.trim();
  }

  return socketIp ?? "127.0.0.1";
}
