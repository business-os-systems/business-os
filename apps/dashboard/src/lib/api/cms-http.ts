import { z } from "zod";

const invalidParamSchema = z.object({
  name: z.string(),
  reason: z.string(),
  code: z.string().optional(),
});

export const cmsProblemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  invalidParams: z.array(invalidParamSchema).optional(),
});

export type CmsProblem = z.infer<typeof cmsProblemSchema>;

export class CmsApiError extends Error {
  readonly status: number;
  readonly problem: CmsProblem;

  constructor(status: number, problem: CmsProblem) {
    super(problem.detail);
    this.name = "CmsApiError";
    this.status = status;
    this.problem = problem;
  }
}

export const cmsEnvelopeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    requestId: z.string(),
    timestamp: z.string(),
  });

function fallbackProblem(status: number, detail: string): CmsProblem {
  return {
    type: "/errors/cms-request-failed",
    title: "Request failed",
    status,
    detail,
    code: "NETWORK_ERROR",
  };
}

async function readProblem(response: Response): Promise<CmsProblem> {
  const body: unknown = await response.json().catch(() => null);
  const parsed = cmsProblemSchema.safeParse(body);
  if (parsed.success) {
    return parsed.data;
  }
  return fallbackProblem(
    response.status,
    "The server returned HTTP " + String(response.status) + " without a problem document."
  );
}

export async function requestCmsJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    throw new CmsApiError(response.status, await readProblem(response));
  }
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    console.error("[cms-client] Unexpected response shape", parsed.error.issues);
    throw new Error("The server returned a response this studio does not understand.");
  }
  return parsed.data;
}
