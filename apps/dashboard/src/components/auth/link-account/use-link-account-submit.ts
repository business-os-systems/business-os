"use client";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitLinkAccount } from "./link-account-service";

export interface LinkAccountSubmitState {
  isLoading: boolean;
  submitError: string | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  clearError: () => void;
}

/** Link mutation and its pending/error state; the submit callback is sync (P12). */
export function useLinkAccountSubmit(
  ticket: string,
  password: string
): LinkAccountSubmitState {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const clearError = useCallback((): void => setSubmitError(null), []);

  const send = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setSubmitError(null);

    const outcome = await submitLinkAccount({ ticket, password });
    if (outcome.kind === "failed") {
      setSubmitError(outcome.message);
      setIsLoading(false);
      return;
    }
    router.push(outcome.redirectUrl);
  }, [ticket, password, router]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (ticket.length === 0 || password.length === 0 || isLoading) return;
      void send();
    },
    [ticket, password, isLoading, send]
  );

  return { isLoading, submitError, submit, clearError };
}