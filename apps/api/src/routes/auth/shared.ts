import type { Context } from "hono";
import { z } from "@hono/zod-openapi";
import {
  extractTokenFromCookie,
  extractTokenFromHeader,
  UnauthorizedError,
  ValidationError,
} from "@suite/auth";

export const problemDetailsResponseSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string(),
  instance: z.string().optional(),
  code: z.string().optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});

/** Success envelope shared by the session, SSO and PIN responses. */
export function successBody<T>(requestId: string, data: T) {
  return {
    success: true as const,
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/** Prefers a non-empty Authorization token, then the session cookie. */
function firstNonEmptyToken(
  headerToken: string | null,
  cookieToken: string | null
): string | null {
  if (headerToken !== null && headerToken.length > 0) {
    return headerToken;
  }
  if (cookieToken !== null && cookieToken.length > 0) {
    return cookieToken;
  }
  return null;
}

export function readOptionalSessionToken(c: Context): string | null {
  return firstNonEmptyToken(
    extractTokenFromHeader(c.req.header("Authorization")),
    extractTokenFromCookie(c.req.header("Cookie"))
  );
}

export function readSessionToken(c: Context): string {
  const token = readOptionalSessionToken(c);
  if (token === null) {
    throw new UnauthorizedError("Authentication required. Missing session token.", {
      code: "AUTH_UNAUTHORIZED",
    });
  }
  return token;
}

export interface JsonBodyOptions<T> {
  readonly schema: z.ZodType<T, z.ZodTypeDef, unknown>;
  readonly detail: string;
}

/** A malformed body is reported as a schema failure, never as a 500. */
async function readRequestBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    // Fall through to schema validation so the caller sees invalidParams.
    return {};
  }
}

/** Parses a body against its schema and reports every issue as invalidParams. */
export async function readJsonBody<T>(
  c: Context,
  options: JsonBodyOptions<T>
): Promise<T> {
  const result = options.schema.safeParse(await readRequestBody(c));
  if (!result.success) {
    throw new ValidationError(
      options.detail,
      result.error.errors.map((issue) => ({
        name: issue.path.join("."),
        reason: issue.message,
      }))
    );
  }
  return result.data;
}
