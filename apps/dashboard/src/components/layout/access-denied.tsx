import React from "react";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@suite/ui";
import { ArrowLeftIcon, LockIcon } from "@suite/ui/icons";
import {
  WEBSITE_BUILDER_ACCESS_DENIED_COPY,
  WEBSITE_BUILDER_BACK_LINK,
  type WebsiteBuilderDenialReason,
} from "./website-builder-nav.config";

export interface AccessDeniedProps {
  readonly reason: WebsiteBuilderDenialReason;
  readonly backHref?: string;
  readonly backLabel?: string;
}

/**
 * Fail-closed denial surface for application surfaces. It renders no tenant
 * data and never exposes the underlying entitlement error, so an unavailable
 * entitlement read can only deny access.
 */
export function AccessDenied({
  reason,
  backHref = WEBSITE_BUILDER_BACK_LINK.href,
  backLabel = WEBSITE_BUILDER_BACK_LINK.label,
}: AccessDeniedProps) {
  const copy = WEBSITE_BUILDER_ACCESS_DENIED_COPY[reason];
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-lg p-8 text-center">
        <CardHeader className="items-center p-0">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted text-text-muted">
            <LockIcon className="h-6 w-6" />
          </div>
          <CardTitle className="text-lg">{copy.title}</CardTitle>
          <CardDescription className="mt-2 text-sm">{copy.detail}</CardDescription>
        </CardHeader>
        <Link
          href={backHref}
          prefetch={false}
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:bg-surface-muted"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          {backLabel}
        </Link>
      </Card>
    </div>
  );
}
