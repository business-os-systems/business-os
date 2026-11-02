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

export async function platformFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(platformApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export async function readProblem(response: Response): Promise<string> {
  const raw = await response.text();
  if (raw.trim() !== "") {
    try {
      const problem = JSON.parse(raw) as ProblemDetails;
      if (problem.detail) return problem.detail;
      if (problem.title) return problem.title;
    } catch {
      return raw.trim();
    }
  }
  return response.statusText || `Request failed with status ${response.status}`;
}


interface DataSchema<T> {
  parse(data: unknown): T;
}

export async function readSuccessData<T>(
  response: Response,
  schema: DataSchema<T>
): Promise<T> {
  const body = (await response.json()) as { data?: unknown };
  if (body === null || typeof body !== "object" || !("data" in body)) {
    throw new InternalServerError("The API returned an invalid success envelope");
  }
  return schema.parse(body.data);
}
