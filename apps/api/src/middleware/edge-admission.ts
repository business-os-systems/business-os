import type { MiddlewareHandler } from "hono";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { ForbiddenError } from "@suite/core/errors";

export const EDGE_ADMISSION_HEADER = "Cf-Access-Jwt-Assertion";

const UNTRUSTED_IDENTITY_HEADERS = [
  "cf-access-authenticated-user-email",
  "cf-access-jwt-assertion",
  "cf-access-user",
];

export interface EdgeAdmissionOptions {
  readonly teamDomain: string;
  readonly audience: string;
  readonly keyResolver?: JWTVerifyGetKey;
}

function normalizeTeamDomain(teamDomain: string): string {
  const raw = teamDomain.trim();
  if (raw === "") {
    throw new Error("EDGE_TEAM_DOMAIN is required for edge admission");
  }
  const withScheme =
    raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `https://${raw}`;
  return new URL(withScheme).host;
}

/**
 * Verifies the Cloudflare Access assertion at the origin and removes any
 * client-supplied identity headers before the application sees them.
 */
export function createEdgeAdmissionMiddleware(
  options: EdgeAdmissionOptions
): MiddlewareHandler {
  const teamDomain = normalizeTeamDomain(options.teamDomain);
  const issuer = `https://${teamDomain}`;
  const keyResolver =
    options.keyResolver ??
    createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  return async (c, next) => {
    const token = c.req.header(EDGE_ADMISSION_HEADER);
    if (!token) {
      throw new ForbiddenError("Edge admission is required.", {
        code: "ADMISSION_DENIED",
      });
    }

    let email: string | null = null;
    try {
      const { payload } = await jwtVerify(token, keyResolver, {
        issuer,
        audience: options.audience,
      });
      if (typeof payload.email === "string") {
        email = payload.email;
      }
    } catch (error) {
      throw new ForbiddenError("Edge admission is required.", {
        code: "ADMISSION_DENIED",
        cause: error,
      });
    }

    for (const header of UNTRUSTED_IDENTITY_HEADERS) {
      c.req.raw.headers.delete(header);
    }
    c.set("admissionEmail", email);

    await next();
  };
}
