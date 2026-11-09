import { z } from "zod";
import { platformFetch, readSuccessData } from "./api";
import { toProblemError } from "./problem-error";

/**
 * Platform support-session client.
 *
 * DELETE deliberately sends no Idempotency-Key: the route is not yet wrapped in
 * the idempotency middleware, and CT-4 coverage for it is tracked by T161. When
 * T161 lands, this call takes the same key factory the flag mutations use.
 */

export const SUPPORT_SESSION_API_PATH = "/api/v1/admin/impersonation";

const timestampSchema = z.string().datetime();

export const platformSupportSessionSchema = z
  .object({
    ticketId: z.string().uuid(),
    organizationId: z.string().min(1),
    reason: z.string().min(1),
    ticketRef: z.string().min(1),
    startedAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict();

const activeSessionsSchema = z
  .object({
    items: z.array(platformSupportSessionSchema),
  })
  .strict();

const endResultSchema = z
  .object({
    endedAt: timestampSchema,
    endedBy: z.string().min(1),
  })
  .strict();

export type PlatformSupportSession = z.infer<typeof platformSupportSessionSchema>;
export type EndSupportSessionResult = z.infer<typeof endResultSchema>;

export async function fetchActiveSupportSessions(
  signal?: AbortSignal
): Promise<PlatformSupportSession[]> {
  const response = await platformFetch(
    `${SUPPORT_SESSION_API_PATH}/active`,
    signal === undefined ? {} : { signal }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  const data = await readSuccessData(response, activeSessionsSchema);
  return data.items;
}

export async function endSupportSession(
  ticketId: string
): Promise<EndSupportSessionResult> {
  const response = await platformFetch(
    `${SUPPORT_SESSION_API_PATH}/${encodeURIComponent(ticketId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw await toProblemError(response);
  }
  return await readSuccessData(response, endResultSchema);
}
