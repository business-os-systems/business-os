import { InternalServerError } from "@suite/core/errors";

export const PLATFORM_API_PATHS = {
  signInOptions: "/api/v1/admin/auth/sign-in/options",
  signInVerify: "/api/v1/admin/auth/sign-in/verify",
  bootstrapOptions: "/api/v1/admin/auth/bootstrap/options",
  bootstrapVerify: "/api/v1/admin/auth/bootstrap/verify",
  me: "/api/v1/admin/auth/me",
  logout: "/api/v1/admin/auth/logout",
} as const;

export interface ProblemDetails {
  readonly title?: string;
  readonly detail?: string;
  readonly code?: string;
}

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

export async function readProblemDetails(response: Response): Promise<ProblemDetails> {
  const raw = await response.text();
  if (raw.trim() === "") return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === "object") {
      return parsed as ProblemDetails;
    }
    return { detail: raw.trim() };
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

export async function readSuccessData<T>(
  response: Response,
  schema: DataSchema<T>,
): Promise<T> {
  const body = (await response.json()) as { data?: unknown };
  if (body === null || typeof body !== "object" || !("data" in body)) {
    throw new InternalServerError(
      "The API returned an invalid success envelope",
    );
  }
  return schema.parse(body.data);
}
