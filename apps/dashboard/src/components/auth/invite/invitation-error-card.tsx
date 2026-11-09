"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangleIcon } from "@suite/ui/icons";
import { AuthCard } from "@/components/auth/auth-card";

export interface InvitationErrorCardProps {
  message: string;
}

/** Verification/expiry notice for an unusable invitation link. */
export function InvitationErrorCard({ message }: InvitationErrorCardProps) {
  return (
    <AuthCard
      size="xl"
      title="Invitation Notice"
      subtitle="There was an issue with this invitation link."
      footer={
        <p className="text-center text-xs text-text-muted">
          <Link href="/login" className="font-semibold text-action hover:underline">
            Return to Sign In
          </Link>
        </p>
      }
    >
      <div className="p-3.5 bg-danger/10 border border-danger/30 text-danger rounded-xl text-xs flex items-start gap-2.5">
        <AlertTriangleIcon size={18} className="shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold">Unable to Join Workspace</p>
          <p className="text-text-secondary">{message}</p>
        </div>
      </div>
    </AuthCard>
  );
}
