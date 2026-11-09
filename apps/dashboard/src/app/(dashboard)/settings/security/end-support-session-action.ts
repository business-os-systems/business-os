"use server";

import { revalidatePath } from "next/cache";
import {
  endSupportSession,
  SupportSessionClientError,
} from "@/lib/support-session-client";

export interface EndSupportSessionActionResult {
  readonly ok: boolean;
  readonly detail: string;
}

/**
 * Tenant-side termination. The API remains the enforcement point: it verifies
 * the session cookie and core:organization:update, scopes the ticket to the
 * workspace and writes the audit row. A transport failure is logged and
 * replaced with an honest generic line instead of leaking infrastructure text.
 */
export async function endSupportSessionAction(
  ticketId: string,
): Promise<EndSupportSessionActionResult> {
  try {
    await endSupportSession(ticketId);
    revalidatePath("/settings/security");
    return { ok: true, detail: "" };
  } catch (error) {
    if (error instanceof SupportSessionClientError) {
      return { ok: false, detail: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("Support-session termination failed:", message);
    return {
      ok: false,
      detail: "The support session could not be ended. Try again.",
    };
  }
}
