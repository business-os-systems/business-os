"use client";

import { useCallback, type FormEvent } from "react";
import { useForgotPasswordFields } from "./use-forgot-password-fields";
import { useForgotPasswordRequest } from "./use-forgot-password-request";

export interface ForgotPasswordController {
  email: string;
  isSubmitted: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  turnstileSiteKey: string;
  isSubmitDisabled: boolean;
  setEmail: (value: string) => void;
  setTurnstileToken: (token: string | null) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  resetSubmission: () => void;
}

/** Composes recovery fields and the reset mutation for the page. */
export function useForgotPassword(): ForgotPasswordController {
  const fields = useForgotPasswordFields();
  const request = useForgotPasswordRequest(fields);

  const setEmail = useCallback(
    (value: string): void => {
      fields.setEmail(value);
      request.clearError();
    },
    [fields, request]
  );

  return {
    email: fields.email,
    isSubmitted: request.isSubmitted,
    isLoading: request.isLoading,
    errorMessage: request.errorMessage,
    turnstileSiteKey: fields.turnstileSiteKey,
    isSubmitDisabled: request.isSubmitDisabled,
    setEmail,
    setTurnstileToken: fields.setTurnstileToken,
    submit: request.submit,
    resetSubmission: request.resetSubmission,
  };
}
