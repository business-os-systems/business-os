"use client";

import React from "react";
import { Spinner } from "@suite/ui";
import { AuthCard } from "@/components/auth/auth-card";

/** Verification-in-progress state for the invitation card. */
export function InvitationLoadingCard() {
  return (
    <AuthCard
      size="xl"
      title="Workspace Invitation"
      subtitle="Verifying invitation details..."
    >
      <div className="py-10 flex flex-col items-center justify-center gap-3">
        <Spinner size="lg" color="action" />
        <p className="text-xs text-text-secondary">Loading invitation...</p>
      </div>
    </AuthCard>
  );
}
