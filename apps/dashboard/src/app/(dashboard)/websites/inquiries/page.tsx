import React from "react";
import { PERMISSIONS } from "@suite/core";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { AccessDenied } from "@/components/layout/access-denied";
import { InquiriesWorkspace } from "@/components/inquiries/inquiries-workspace";

/**
 * Inquiries is a first-class destination (FR-127). The list, site filter and
 * unread count read the tenant plane; PII stays hidden unless the actor holds
 * the separate leads-PII capability.
 */
export default async function WebsiteInquiriesPage() {
  const session = await requireAuth();
  const access = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_READ,
  });
  if (access.kind === "denied") {
    return <AccessDenied reason={access.reason} />;
  }
  const pii = await evaluateWebsiteBuilderAccess({
    actor: session,
    capability: PERMISSIONS.WEBSITE_BUILDER.LEADS_PII,
  });
  return <InquiriesWorkspace canRevealPii={pii.kind === "granted"} />;
}
