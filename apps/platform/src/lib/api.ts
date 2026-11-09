import { z } from "zod";
import { InternalServerError } from "@suite/core/errors";

/** One header and one key factory for every control-plane mutation (CT-4). */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";

export function createIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

export const PLATFORM_API_PATHS = {
  signInOptions: "/api/v1/admin/auth/sign-in/options",
  signInVerify: "/api/v1/admin/auth/sign-in/verify",
  bootstrapOptions: "/api/v1/admin/auth/bootstrap/options",
  bootstrapVerify: "/api/v1/admin/auth/bootstrap/verify",
  me: "/api/v1/admin/auth/me",
  logout: "/api/v1/admin/auth/logout",
} as const;

const invalidParamSchema = z.object({
  name: z.string(),
  reason: z.string(),
  code: z.string().optional(),
});

const problemDetailsSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    detail: z.string().optional(),
    status: z.number().int().optional(),
    code: z.string().optional(),
    requestId: z.string().optional(),
    invalidParams: z.array(invalidParamSchema).optional(),
  })
  .passthrough();

/** The RFC 7807 body, validated at the network boundary. */
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export function platformApiUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl) {
    throw new InternalServerError("NEXT_PUBLIC_API_URL must be configured");
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

const AUTH_PATH_PREFIX = "/api/v1/admin/auth";

export type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * The shell registers one handler, so a screen that loses its control session
 * sends the operator back to sign-in instead of painting an error banner over
 * a session the server already rejected.
 */
export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
): void {
  unauthorizedHandler = handler;
}

export async function platformFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(platformApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  // The auth endpoints answer 401 as part of their normal flow. The provider
  // handles those itself, so they must not trigger the global redirect.
  if (
    response.status === 401 &&
    !path.startsWith(AUTH_PATH_PREFIX) &&
    unauthorizedHandler !== null
  ) {
    unauthorizedHandler();
  }

  return response;
}

export function parseProblemDetails(value: unknown): ProblemDetails | null {
  const parsed = problemDetailsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function readProblemDetails(response: Response): Promise<ProblemDetails> {
  const raw = await response.text();
  if (raw.trim() === "") return {};
  try {
    return parseProblemDetails(JSON.parse(raw)) ?? { detail: raw.trim() };
  } catch {
    return { detail: raw.trim() };
  }
}

export async function readProblem(response: Response): Promise<string> {
  const problem = await readProblemDetails(response);
  return (
    (problem.detail ?? problem.title ?? response.statusText) ||
    `Request failed with status ${response.status}`
  );
}

interface DataSchema<T> {
  parse(data: unknown): T;
}

function hasSuccessData(body: unknown): body is { data: unknown } {
  return typeof body === "object" && body !== null && "data" in body;
}

export async function readSuccessData<T>(
  response: Response,
  schema: DataSchema<T>,
): Promise<T> {
  const body: unknown = await response.json();
  if (!hasSuccessData(body)) {
    throw new InternalServerError(
      "The API returned an invalid success envelope",
    );
  }
  return schema.parse(body.data);
}
