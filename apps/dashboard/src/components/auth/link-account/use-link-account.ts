"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useLinkAccountPassword } from "./use-link-account-password";
import type { LinkAccountTicketDetails } from "./link-account-service";
import { useLinkAccountSubmit } from "./use-link-account-submit";
import { useLinkAccountTicket } from "./use-link-account-ticket";
import type { FormEvent } from "react";

export interface LinkAccountController {
  ticket: string;
  ticketDetails: LinkAccountTicketDetails | null;
  password: string;
  showPassword: boolean;
  isLoading: boolean;
  errorMessage: string | null;
  setPassword: (value: string) => void;
  togglePasswordVisibility: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}

/** Composes ticket lookup, password fields and the link mutation (P12). */
export function useLinkAccount(): LinkAccountController {
  const searchParams = useSearchParams();
  const ticket = searchParams.get("ticket") ?? "";
  const ticketState = useLinkAccountTicket(ticket);
  const passwordState = useLinkAccountPassword();
  const submission = useLinkAccountSubmit(ticket, passwordState.password);

  const setPassword = useCallback(
    (value: string): void => {
      passwordState.setPassword(value);
      submission.clearError();
    },
    [passwordState, submission]
  );

  return {
    ticket,
    ticketDetails: ticketState.ticketDetails,
    password: passwordState.password,
    showPassword: passwordState.showPassword,
    isLoading: submission.isLoading,
    errorMessage: submission.submitError ?? ticketState.ticketError,
    setPassword,
    togglePasswordVisibility: passwordState.togglePasswordVisibility,
    submit: submission.submit,
  };
}
