"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@suite/ui";
import { CheckIcon } from "@suite/ui/icons";
import { AuthCard } from "@/components/auth/auth-card";

export interface InvitationAlreadyAcceptedCardProps {
  email: string | null;
}

function signInHref(email: string | null): string {
  if (email === null || email.length === 0) return "/login";
  return "/login?email=" + encodeURIComponent(email);
}

function AlreadyAcceptedNotice() {
  return (
    <div className="p-3.5 bg-brand-tint border border-brand/30 text-text rounded-xl text-xs flex items-start gap-3">
      <CheckIcon size={20} className="shrink-0 text-brand mt-0.5" />
      <div className="space-y-1">
        <p className="font-semibold text-text">Account Ready</p>
        <p className="text-text-secondary leading-relaxed">
          This invitation link has already been used. You can log into your
          workspace directly using your email and password.
        </p>
      </div>
    </div>
  );
}

function AlreadyAcceptedFooter() {
  return (
    <p className="text-center text-xs text-text-muted">
      Need help? Contact your workspace administrator or{" "}
      <Link href="/login" className="font-semibold text-action hover:underline">
        Sign In
      </Link>
    </p>
  );
}

/** Terminal state for an invitation link that has already been consumed. */
export function InvitationAlreadyAcceptedCard({
  email,
}: InvitationAlreadyAcceptedCardProps) {
  const router = useRouter();

  return (
    <AuthCard
      size="xl"
      title="Invitation Already Accepted"
      subtitle="Your membership in this workspace has already been activated."
      footer={<AlreadyAcceptedFooter />}
    >
      <div className="space-y-4 py-2">
        <AlreadyAcceptedNotice />
        <Button
          type="button"
          variant="primary"
          fullWidth
          onClick={() => router.push(signInHref(email))}
        >
          Go to Sign In →
        </Button>
      </div>
    </AuthCard>
  );
}