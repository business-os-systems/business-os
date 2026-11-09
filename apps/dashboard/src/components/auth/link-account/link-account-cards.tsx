"use client";

import React from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AlertTriangleIcon } from "@suite/ui/icons";
import { Spinner } from "@suite/ui";

/** Suspense fallback shown while the challenge ticket is read from the URL. */
export function LinkAccountLoadingCard() {
  return (
    <AuthCard
      title="Link your account"
      subtitle="Loading account linking ticket..."
    >
      <div className="py-6 flex items-center justify-center">
        <Spinner size="md" color="action" />
      </div>
    </AuthCard>
  );
}

/** Shown when the URL carries no ticket at all. */
export function LinkAccountMissingCard() {
  return (
    <AuthCard
      title="Account Linking"
      subtitle="Secure account collision defense"
      footer={<LinkAccountFooter label="Back to" />}
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center">
          <AlertTriangleIcon size={20} />
        </div>
        <p className="text-sm font-semibold text-text">Missing Linking Challenge</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          No valid verification challenge was provided. Please sign in with your
          credentials or OAuth provider.
        </p>
        <Link
          href="/login"
          className="mt-2 text-xs text-action hover:text-action-hover font-semibold underline underline-offset-2"
        >
          Return to Sign in
        </Link>
      </div>
    </AuthCard>
  );
}

function LinkAccountFooter({ label }: { label: string }) {
  return (
    <p className="text-xs text-text-muted">
      {label}{" "}
      <Link
        href="/login"
        className="text-action hover:text-action-hover font-semibold underline-offset-2 hover:underline"
      >
        Sign in
      </Link>
    </p>
  );
}

/** Shared footer for the challenge form state. */
export function LinkAccountChallengeFooter() {
  return <LinkAccountFooter label="Not your account?" />;
}