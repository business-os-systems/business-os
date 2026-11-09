"use client";

import React from "react";
import { ForgotPasswordForm } from "./forgot-password-form";
import { ForgotPasswordSentView } from "./forgot-password-sent-view";
import type { ForgotPasswordController } from "./use-forgot-password";

export interface ForgotPasswordFormBodyProps {
  controller: ForgotPasswordController;
}

/** Selects the confirmation or form view for the recovery card. */
export function ForgotPasswordFormBody({
  controller,
}: ForgotPasswordFormBodyProps) {
  if (controller.isSubmitted) {
    return (
      <ForgotPasswordSentView
        email={controller.email}
        onReset={controller.resetSubmission}
      />
    );
  }
  return <ForgotPasswordForm controller={controller} />;
}
