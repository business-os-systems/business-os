"use client";

import React from "react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { InvitationForm } from "./invitation-form";
import type { InvitationAcceptController } from "./use-invitation-accept";
import type { InvitationDetails } from "@/lib/invitation-client";

export interface InvitationFormCardProps {
  details: InvitationDetails;
  controller: InvitationAcceptController;
}

/** Wide-rectangle invitation card that hosts the acceptance form. */
export function InvitationFormCard({
  details,
  controller,
}: InvitationFormCardProps) {
  return (
    <AuthCard
      size="xl"
      title={"Join " + details.organizationName}
      subtitle={"You have been invited to join as " + details.roleName}
      footer={
        <p className="text-center text-xs text-text-muted">
          Already set up your credentials?{" "}
          <Link href="/login" className="font-semibold text-action hover:underline">
            Sign in directly
          </Link>
        </p>
      }
    >
      <InvitationForm details={details} controller={controller} />
    </AuthCard>
  );
}
