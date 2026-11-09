"use client";

import { useCallback, useState, type FormEvent } from "react";
import { requestPasswordReset } from "./forgot-password-service";
import type { ForgotPasswordFields } from "./use-forgot-password-fields";

export interface ForgotPasswordResetState {
  isLoading: boolean;
  isSubmitted: boolean;
  errorMessage: string | null;
  send: () => Promise<void>;
  resetSubmission: () => void;
  clearError: () => void;
}

/** Reset mutation and its feedback state. */
export function useForgotPasswordReset(
  fields: ForgotPasswordFields
): ForgotPasswordResetState {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearError = useCallback((): void => {
    setErrorMessage(null);
  }, []);
  const resetSubmission = useCallback((): void => {
    setIsSubmitted(false);
  }, []);

  const send = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);
    const outcome = await requestPasswordReset({
      email: fields.email.trim(),
      turnstileToken: fields.turnstileToken,
    });
    if (outcome.kind === "failed") {
      setErrorMessage(outcome.message);
    } else {
      setIsSubmitted(true);
    }
    setIsLoading(false);
  }, [fields.email, fields.turnstileToken]);

  return { isLoading, isSubmitted, errorMessage, send, resetSubmission, clearError };
}

export interface ForgotPasswordRequestState {
  isLoading: boolean;
  isSubmitted: boolean;
  errorMessage: string | null;
  isSubmitDisabled: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  resetSubmission: () => void;
  clearError: () => void;
}

/** Binds the reset mutation to the form's submit event and disabled rules. */
export function useForgotPasswordRequest(
  fields: ForgotPasswordFields
): ForgotPasswordRequestState {
  const reset = useForgotPasswordReset(fields);
  const { isLoading, send } = reset;

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (!fields.email.trim() || isLoading) return;
      void send();
    },
    [fields.email, isLoading, send]
  );

  const isSubmitDisabled =
    isLoading ||
    !fields.email.trim() ||
    (fields.isTurnstileConfigured && !fields.turnstileToken);

  return {
    isLoading,
    isSubmitted: reset.isSubmitted,
    errorMessage: reset.errorMessage,
    isSubmitDisabled,
    submit,
    resetSubmission: reset.resetSubmission,
    clearError: reset.clearError,
  };
}
