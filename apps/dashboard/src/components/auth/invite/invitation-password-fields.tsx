"use client";

import React from "react";
import { InvitationPasswordField } from "./invitation-password-field";
import type { InvitationAcceptController } from "./use-invitation-accept";

export interface InvitationPasswordFieldsProps {
  controller: InvitationAcceptController;
}

/** Two-column password and confirmation grid for the invitation form. */
export function InvitationPasswordFields({
  controller,
}: InvitationPasswordFieldsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      <InvitationPasswordField
        controller={controller}
        field="password"
        id="invitee-password"
        label="Create Password"
        placeholder="Min. 12 characters"
      />
      <InvitationPasswordField
        controller={controller}
        field="confirmPassword"
        id="invitee-confirm-password"
        label="Confirm Password"
        placeholder="Re-enter your password"
      />
    </div>
  );
}
