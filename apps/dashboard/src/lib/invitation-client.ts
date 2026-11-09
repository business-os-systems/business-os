import { z } from "zod";

/**
 * Invitation details and their live validation contract. The accept page only
 * renders the result of this loader, so a malformed or refused payload becomes
 * a typed state instead of a cascading field fallback (P3/P10/P12).
 */

export interface InvitationDetails {
  isValid: boolean;
  token: string;
  email: string;
  name: string | null;
  organizationName: string;
  roleName: string;
  branchName: string;
  hasPassword: boolean;
  expiresAt: string;
}

export type InvitationLoadResult =
  | { readonly kind: "loaded"; readonly details: InvitationDetails }
  | { readonly kind: "already-accepted"; readonly message: string }
  | { readonly kind: "invalid"; readonly message: string };

const invitationDetailsSchema = z.object({
  isValid: z.boolean(),
  token: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  organizationName: z.string(),
  roleName: z.string(),
  branchName: z.string(),
  hasPassword: z.boolean(),
  expiresAt: z.string(),
});

const problemSchema = z.object({
  code: z.string().optional(),
  detail: z.string().min(1).optional(),
});

const INVITATION_ACCEPTED = "INVITATION_ACCEPTED";

export async function loadInvitationDetails(
  token: string
): Promise<InvitationLoadResult> {
  const response = await fetch(
    `/api/v1/auth/invitation/accept?token=${encodeURIComponent(token)}`
  );
  const payload = await readJsonBody(response);

  if (!response.ok) {
    const problem = problemSchema.safeParse(payload);
    const message =
      problem.success && problem.data.detail !== undefined
        ? problem.data.detail
        : "This invitation link is invalid or has expired.";
    if (problem.success && problem.data.code === INVITATION_ACCEPTED) {
      return { kind: "already-accepted", message };
    }
    return { kind: "invalid", message };
  }

  const parsed = invitationDetailsSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      kind: "invalid",
      message: "The invitation response was invalid. Reload and try again.",
    };
  }
  return { kind: "loaded", details: parsed.data };
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
