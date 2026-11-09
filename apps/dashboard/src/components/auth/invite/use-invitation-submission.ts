"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "./invitation-accept-service";
import { validateInvitationCredentials } from "./invitation-validation";
import type { InvitationFormState } from "./use-invitation-form";

export interface InvitationSubmission {
  isSubmitting: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}

export interface InvitationSubmissionOptions {
  token: string;
  form: InvitationFormState;
  onAlreadyAccepted: () => void;
}

type AcceptanceLauncher = () => Promise<void>;

function useAcceptanceLauncher(
  options: InvitationSubmissionOptions,
  setIsSubmitting: (value: boolean) => void
): AcceptanceLauncher {
  const router = useRouter();
  const { token, form, onAlreadyAccepted } = options;

  return useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    const outcome = await acceptInvitation({
      token,
      password: form.password,
      name: form.name,
    });
    setIsSubmitting(false);
    if (outcome.kind === "accepted") {
      router.push(outcome.redirectUrl);
      router.refresh();
      return;
    }
    if (outcome.kind === "already-accepted") {
      onAlreadyAccepted();
    }
    form.setErrorMessage(outcome.message);
  }, [token, form, onAlreadyAccepted, router, setIsSubmitting]);
}

function validateForSubmission(
  token: string,
  form: InvitationFormState
): string | null {
  return validateInvitationCredentials({
    token,
    password: form.password,
    confirmPassword: form.confirmPassword,
  });
}

/**
 * Acceptance mutation for the invitation form. The submit callback is
 * synchronous and the launched promise handles its own failures (P12).
 */
export function useInvitationSubmission(
  options: InvitationSubmissionOptions
): InvitationSubmission {
  const { token, form } = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sendAcceptance = useAcceptanceLauncher(options, setIsSubmitting);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      form.clearError();

      const message = validateForSubmission(token, form);
      if (message !== null) {
        form.setErrorMessage(message);
        return;
      }
      void sendAcceptance();
    },
    [token, form, sendAcceptance]
  );

  return { isSubmitting, submit };
}