import React from "react";
import { PERMISSIONS } from "@suite/core";
import { Card, CardContent, CardHeader, CardTitle } from "@suite/ui";
import { requireAuth } from "@/lib/auth-guard";
import { evaluateWebsiteBuilderAccess } from "@/lib/website-builder-access";
import { AccessDenied } from "@/components/layout/access-denied";

/**
 * Inquiries is a first-class destination (FR-127). The inquiry list, site
 * filter and unread count are built by the inquiries slice; this route keeps
 * the destination navigable and independently capability-gated meanwhile.
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text">Inquiries</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Every enquiry captured by this workspace&apos;s websites, in one place.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inquiries have their own destination</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            The inquiry list, site filter and unread count arrive with the
            inquiries release. No enquiry data is shown until that read exists.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
