"use client";

import React from "react";
import { Button } from "@suite/ui";
import { Turnstile } from "@/components/auth/turnstile";
import { AuthErrorAlert } from "@/components/auth/auth-error-alert";
import { ForgotPasswordEmailField } from "./forgot-password-email-field";
import type { ForgotPasswordController } from "./use-forgot-password";

const ERROR_ALERT_ID = "forgot-password-error";

export interface ForgotPasswordFormProps {
  controller: ForgotPasswordController;
}

function SubmitButton({ controller }: ForgotPasswordFormProps) {
  return (
    <Button
      type="submit"
      variant="primary"
      fullWidth
      disabled={controller.isSubmitDisabled}
      isLoading={controller.isLoading}
      className="mt-1 min-h-[44px]"
    >
      {controller.isLoading ? "Sending recovery link..." : "Send reset link"}
    </Button>
  );
}

/** Recovery form body: email field, bot defense and submit control. */
export function ForgotPasswordForm({ controller }: ForgotPasswordFormProps) {
  const errorMessage = controller.errorMessage;
  const hasError = errorMessage !== null;

  return (
    <form
      onSubmit={controller.submit}
      className="flex flex-col gap-3.5 text-text"
      noValidate
    >
      {errorMessage !== null && (
        <AuthErrorAlert message={errorMessage} alertId={ERROR_ALERT_ID} />
      )}
      <ForgotPasswordEmailField
        email={controller.email}
        isLoading={controller.isLoading}
        hasError={hasError}
        onEmailChange={controller.setEmail}
      />
      <Turnstile
        siteKey={controller.turnstileSiteKey}
        onVerify={controller.setTurnstileToken}
      />
      <SubmitButton controller={controller} />
    </form>
  );
}
