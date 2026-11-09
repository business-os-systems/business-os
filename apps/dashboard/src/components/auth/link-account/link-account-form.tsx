"use client";

import React from "react";
import { Button } from "@suite/ui";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { LinkAccountPasswordField } from "./link-account-password-field";
import { LinkAccountTargetAccount } from "./link-account-target-account";
import { formatProviderName } from "./provider-name";
import type { LinkAccountController } from "./use-link-account";

const ERROR_ALERT_ID = "link-account-error";

export interface LinkAccountFormProps {
  controller: LinkAccountController;
}

function LinkAccountSubmitButton({
  controller,
}: {
  controller: LinkAccountController;
}) {
  const providerName = formatProviderName(controller.ticketDetails?.providerId);
  return (
    <Button
      type="submit"
      variant="primary"
      fullWidth
      isLoading={controller.isLoading}
      disabled={controller.isLoading || controller.password.length === 0}
      className="mt-1 min-h-[44px]"
    >
      {controller.isLoading
        ? "Verifying & Linking..."
        : "Link " + providerName + " Account"}
    </Button>
  );
}

/** Password challenge form for linking an OAuth identity. */
export function LinkAccountForm({ controller }: LinkAccountFormProps) {
  const errorMessage = controller.errorMessage;
  const targetEmail = controller.ticketDetails?.email ?? null;

  return (
    <form
      onSubmit={controller.submit}
      className="flex flex-col gap-3.5 text-text"
      noValidate
    >
      {errorMessage !== null && (
        <AuthErrorAlert message={errorMessage} alertId={ERROR_ALERT_ID} />
      )}
      {targetEmail !== null && <LinkAccountTargetAccount email={targetEmail} />}
      <LinkAccountPasswordField
        controller={controller}
        hasError={errorMessage !== null}
      />
      <LinkAccountSubmitButton controller={controller} />
    </form>
  );
}
