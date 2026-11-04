"use client";

import React, { useState } from "react";
import { Button } from "@suite/ui";
import { LockIcon } from "@suite/ui/icons";
import type { BlockingTenantStatus } from "@suite/core";
import { SUSPENSION_NOTICE_COPY } from "./suspension-notice.config";

interface SuspensionNoticeProps {
  readonly tenantName: string;
  readonly status: BlockingTenantStatus;
  readonly supportEmail: string | null;
}

async function signOut(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error(`Sign out failed (${response.status}). Please retry.`);
  }
  window.location.assign("/login");
}

export function SuspensionNotice({
  tenantName,
  status,
  supportEmail,
}: SuspensionNoticeProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = SUSPENSION_NOTICE_COPY[status];

  async function handleSignOut(): Promise<void> {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      setIsSigningOut(false);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Sign out failed. Please retry."
      );
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section
        aria-labelledby="suspension-heading"
        className="w-full max-w-xl rounded-xl border border-border bg-surface p-8 shadow-sm"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning">
            <LockIcon size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
              {tenantName}
            </p>
            <h1
              id="suspension-heading"
              className="mt-1 text-xl font-semibold text-text"
            >
              {copy.heading}
            </h1>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-secondary">
          {copy.detail}
        </p>

        {supportEmail === null ? (
          <p className="mt-5 text-sm text-secondary">
            Contact your platform administrator for the next step.
          </p>
        ) : (
          <p className="mt-5 text-sm text-secondary">
            Questions about this change? Contact platform support at{" "}
            <a
              className="font-medium text-action underline underline-offset-4 hover:text-action-hover"
              href={`mailto:${supportEmail}`}
            >
              {supportEmail}
            </a>
            .
          </p>
        )}

        {errorMessage === null ? null : (
          <p role="alert" className="mt-5 text-sm font-medium text-danger">
            {errorMessage}
          </p>
        )}

        <div className="mt-7 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </section>
    </main>
  );
}