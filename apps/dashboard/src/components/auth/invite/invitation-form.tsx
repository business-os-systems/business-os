"use client";

import React from "react";
import { Button } from "@suite/ui";
import { InvitationContextStrip } from "./invitation-context-strip";
import { InvitationNameField } from "./invitation-name-field";
import { InvitationPasswordFields } from "./invitation-password-fields";
import type { InvitationAcceptController } from "./use-invitation-accept";
import type { InvitationDetails } from "@/lib/invitation-client";

export interface InvitationFormProps {
  details: InvitationDetails;
  controller: InvitationAcceptController;
}

function SubmitButton({ controller }: { controller: InvitationAcceptController }) {
  return (
    <Button
      type="submit"
      variant="primary"
      fullWidth
      isLoading={controller.isSubmitting}
      disabled={controller.isSubmitting}
      className="mt-1"
    >
      {controller.isSubmitting
        ? "Joining workspace..."
        : "Set Password & Join Workspace →"}
    </Button>
  );
}

/** Credential form that joins the invited user to the workspace. */
export function InvitationForm({ details, controller }: InvitationFormProps) {
  const errorMessage = controller.errorMessage;

  return (
    <form onSubmit={controller.submit} className="flex flex-col gap-3">
      {errorMessage !== null && (
        <div className="p-2.5 bg-danger/10 border border-danger/30 text-danger rounded-lg text-xs font-medium">
          {errorMessage}
        </div>
      )}

      <InvitationContextStrip details={details} />
      <InvitationNameField
        name={controller.name}
        disabled={controller.isSubmitting}
        onNameChange={controller.setName}
      />
      <InvitationPasswordFields controller={controller} />

      <SubmitButton controller={controller} />
    </form>
  );
}