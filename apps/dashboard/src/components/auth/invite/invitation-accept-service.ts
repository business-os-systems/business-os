import { z } from "zod";
import { firstNonEmpty } from "@/components/auth/shared/first-non-empty";
import { readAuthProblem } from "@/components/auth/shared/problem-details";
import { readJsonBody } from "@/components/auth/shared/read-json-body";
import {
  loadInvitationDetails,
  type InvitationLoadResult,
} from "@/lib/invitation-client";

/**
 * Typed boundary for the invitation accept endpoint. The page previously read
 * untyped JSON, duplicated the code/detail fallbacks and rethrew network
 * failures (P3/P10/P12).
 */

const ACCEPT_ENDPOINT = "/api/v1/auth/invitation/accept";
const DEFAULT_REDIRECT = "/dashboard";
const GENERIC_FAILURE_MESSAGE = "Failed to accept workspace invitation.";
const NETWORK_FAILURE_MESSAGE = "A network error occurred. Please try again.";
const CONNECTION_FAILURE_MESSAGE =
  "Unable to verify invitation details. Please check your connection.";
const ALREADY_ACCEPTED_CODE = "INVITATION_ACCEPTED";

const successSchema = z.object({
  redirectUrl: z.string().min(1).optional(),
});

export type InvitationAcceptOutcome =
  | { readonly kind: "accepted"; readonly redirectUrl: string }
  | { readonly kind: "already-accepted"; readonly message: string }
  | { readonly kind: "failed"; readonly message: string };

export interface InvitationAcceptRequest {
  token: string;
  password: string;
  name: string;
}

export function mapInvitationAcceptResponse(
  response: Pick<Response, "ok" | "status">,
  body: unknown
): InvitationAcceptOutcome {
  if (!response.ok) {
    const problem = readAuthProblem(body);
    const message = problem?.detail ?? GENERIC_FAILURE_MESSAGE;
    if (problem?.code === ALREADY_ACCEPTED_CODE) {
      return { kind: "already-accepted", message };
    }
    return { kind: "failed", message };
  }

  const parsed = successSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "failed", message: GENERIC_FAILURE_MESSAGE };
  }
  return {
    kind: "accepted",
    redirectUrl:
      firstNonEmpty(parsed.data.redirectUrl ?? null, DEFAULT_REDIRECT) ??
      DEFAULT_REDIRECT,
  };
}

export async function acceptInvitation(
  request: InvitationAcceptRequest
): Promise<InvitationAcceptOutcome> {
  try {
    const response = await fetch(ACCEPT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: request.token,
        password: request.password,
        name: firstNonEmpty(request.name.trim(), null) ?? undefined,
      }),
    });
    const body = await readJsonBody(response);
    return mapInvitationAcceptResponse(response, body);
  } catch {
    return { kind: "failed", message: NETWORK_FAILURE_MESSAGE };
  }
}

/**
 * Verification loader that converts a transport rejection into the visible
 * connection error the page used to catch inline (P9/P12).
 */
export async function loadInvitationSafely(
  token: string
): Promise<InvitationLoadResult> {
  try {
    return await loadInvitationDetails(token);
  } catch (error) {
    console.error("[InvitationAccept] Failed to verify invitation:", error);
    return { kind: "invalid", message: CONNECTION_FAILURE_MESSAGE };
  }
}
