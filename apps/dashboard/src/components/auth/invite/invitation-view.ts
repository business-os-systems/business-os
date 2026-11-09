import type { InvitationDetails } from "@/lib/invitation-client";

/**
 * Pure view resolver for the accept page. The original page nested four
 * ternaries in JSX; the same precedence is now an exhaustive discriminated
 * union (P1/P3/P7).
 */

export interface InvitationViewState {
  isLoadingDetails: boolean;
  isAlreadyAccepted: boolean;
  fetchError: string | null;
  details: InvitationDetails | null;
}

export type InvitationView =
  | { readonly kind: "loading" }
  | { readonly kind: "already-accepted"; readonly email: string | null }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "form"; readonly details: InvitationDetails };

const DEFAULT_INVALID_MESSAGE = "Invitation is invalid or has expired.";

export function resolveInvitationView(
  state: InvitationViewState
): InvitationView {
  if (state.isLoadingDetails) {
    return { kind: "loading" };
  }
  if (state.isAlreadyAccepted) {
    return {
      kind: "already-accepted",
      email: state.details?.email ?? null,
    };
  }
  if (state.fetchError !== null) {
    return { kind: "error", message: state.fetchError };
  }
  if (state.details === null) {
    return { kind: "error", message: DEFAULT_INVALID_MESSAGE };
  }
  return { kind: "form", details: state.details };
}
