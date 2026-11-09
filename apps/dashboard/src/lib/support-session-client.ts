import { cookies } from "next/headers";
import { z } from "zod";
import { PLATFORM_ERROR_CODE, TIMEOUTS } from "@suite/core";
import { SESSION_COOKIE_NAME } from "@/lib/auth-constants";
import { getApiServerUrl } from "@/lib/env";

/**
 * Server-side client for the tenant support-session read routes.
 *
 * The dashboard deliberately calls the API instead of reading
 * platform.impersonation_sessions: the tenant database identity has no grant on
 * the platform schema, and the API is the place that scopes the read to the
 * verified workspace. The tenant session cookie is forwarded, never a
 * client-supplied organization id.
 */
const DEFAULT_HISTORY_LIMIT = 20;

const supportSessionSchema = z
  .object({
    ticketId: z.string().uuid(),
    operatorDisplayName: z.string().min(1),
    reason: z.string().min(1),
    ticketRef: z.string().min(1),
    startedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

const historyItemSchema = supportSessionSchema.extend({
  endedAt: z.string().datetime().nullable(),
  endedBy: z.string().min(1).nullable(),
});

const activeEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        active: z.boolean(),
        session: supportSessionSchema.nullable(),
      })
      .strict(),
    requestId: z.string(),
    timestamp: z.string(),
  })
  .strict();

const historyEnvelopeSchema = z
  .object({
    success: z.literal(true),
    data: z
      .object({
        items: z.array(historyItemSchema),
        nextCursor: z.string().nullable(),
      })
      .strict(),
    requestId: z.string(),
    timestamp: z.string(),
  })
  .strict();

const problemSchema = z
  .object({
    title: z.string().optional(),
    detail: z.string().optional(),
    status: z.number().int().optional(),
    code: z.string().optional(),
  })
  .passthrough();

export type SupportSessionView = z.infer<typeof supportSessionSchema>;
export type SupportSessionHistoryItem = z.infer<typeof historyItemSchema>;

export interface SupportSessionHistoryPage {
  readonly items: SupportSessionHistoryItem[];
  readonly nextCursor: string | null;
}

export interface SupportSessionHistoryQuery {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface SupportSessionClientErrorOptions {
  readonly status: number;
  readonly code: string | null;
}

/** Typed transport error that keeps the API's RFC 7807 detail intact. */
export class SupportSessionClientError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(detail: string, options: SupportSessionClientErrorOptions) {
    super(detail);
    this.name = "SupportSessionClientError";
    this.status = options.status;
    this.code = options.code;
  }
}

async function readSessionCookie(): Promise<string> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) {
    throw new SupportSessionClientError(
      "An authenticated tenant session is required.",
      { status: 401, code: PLATFORM_ERROR_CODE.AUTH_REQUIRED }
    );
  }
  return value;
}

function readProblemDetail(body: unknown, fallback: string): string {
  const parsed = problemSchema.safeParse(body);
  if (!parsed.success) {
    return fallback;
  }
  return parsed.data.detail ?? parsed.data.title ?? fallback;
}

function readProblemCode(body: unknown): string | null {
  const parsed = problemSchema.safeParse(body);
  return parsed.success ? (parsed.data.code ?? null) : null;
}

/**
 * A non-JSON body (a proxy error page, for example) is tolerated as "no
 * problem detail". Anything other than the SyntaxError that response.json()
 * raises for invalid JSON is a real transport failure and must surface.
 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function requestSupportSession(path: string): Promise<unknown> {
  const sessionCookie = await readSessionCookie();
  const response = await fetch(`${getApiServerUrl()}${path}`, {
    headers: {
      Accept: "application/json",
      Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
    },
    cache: "no-store",
    // A control-plane stall must never hold a tenant page open (FR-053).
    signal: AbortSignal.timeout(TIMEOUTS.DEFAULT_FETCH_TIMEOUT_MS),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new SupportSessionClientError(
      readProblemDetail(body, `Support-session request failed (${response.status}).`),
      { status: response.status, code: readProblemCode(body) }
    );
  }
  return body;
}

export async function fetchActiveSupportSession(): Promise<SupportSessionView | null> {
  const body = await requestSupportSession("/api/v1/support-sessions/active");
  const parsed = activeEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new SupportSessionClientError(
      "The API returned an invalid active support-session payload.",
      { status: 502, code: null }
    );
  }
  return parsed.data.data.session;
}

export async function fetchSupportSessionHistory(
  query: SupportSessionHistoryQuery = {}
): Promise<SupportSessionHistoryPage> {
  const params = new URLSearchParams();
  if (query.cursor !== undefined) {
    params.set("cursor", query.cursor);
  }
  params.set("limit", String(query.limit ?? DEFAULT_HISTORY_LIMIT));
  const body = await requestSupportSession(
    `/api/v1/support-sessions/history?${params.toString()}`
  );
  const parsed = historyEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new SupportSessionClientError(
      "The API returned an invalid support-session history payload.",
      { status: 502, code: null }
    );
  }
  return parsed.data.data;
}
