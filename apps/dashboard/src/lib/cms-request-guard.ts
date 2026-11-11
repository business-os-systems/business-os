import { NextRequest, NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  type SessionPayloadWithOrganization,
} from "@/lib/session-helper";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { websiteBuilderAccessProblem } from "@/lib/website-builder-problem";

export type CmsRequestAuthorization =
  | { readonly kind: "authorized"; readonly session: SessionPayloadWithOrganization }
  | { readonly kind: "denied"; readonly response: NextResponse };

/**
 * Resolves a CMS BFF request to the verified session and enforces the Website
 * Builder capability for the action. Tenant and actor identity come only from
 * the signed session, so a request header can never select another workspace
 * (FR-057, FR-059, CT-2).
 */
export async function authorizeCmsRequest(
  request: NextRequest,
  capability: string
): Promise<CmsRequestAuthorization> {
  const auth = await getAuthenticatedSession(request, { requireOrganization: true });
  if (!auth.ok) {
    return { kind: "denied", response: auth.response };
  }

  const access = await evaluateWebsiteBuilderAccess({
    actor: auth.session,
    capability,
  });
  if (access.kind === "denied") {
    return {
      kind: "denied",
      response: websiteBuilderAccessProblem(access.reason, request.nextUrl.pathname),
    };
  }

  return { kind: "authorized", session: auth.session };
}
