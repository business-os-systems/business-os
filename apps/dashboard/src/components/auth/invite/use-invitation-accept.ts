"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { resolveInvitationView, type InvitationView } from "./invitation-view";
import { useInvitationDetails } from "./use-invitation-details";
import { useInvitationForm, type InvitationFormState } from "./use-invitation-form";
import {
  useInvitationSubmission,
  type InvitationSubmission,
} from "./use-invitation-submission";
import type { FormEvent } from "react";

export interface InvitationAcceptController {
  view: InvitationView;
  name: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  errorMessage: string | null;
  isSubmitting: boolean;
  setName: (value: string) => void;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  togglePasswordVisibility: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}

interface ControllerSources {
  view: InvitationView;
  form: InvitationFormState;
  submission: InvitationSubmission;
}

function toController(sources: ControllerSources): InvitationAcceptController {
  return {
    view: sources.view,
    name: sources.form.name,
    password: sources.form.password,
    confirmPassword: sources.form.confirmPassword,
    showPassword: sources.form.showPassword,
    errorMessage: sources.form.errorMessage,
    isSubmitting: sources.submission.isSubmitting,
    setName: sources.form.setName,
    setPassword: sources.form.setPassword,
    setConfirmPassword: sources.form.setConfirmPassword,
    togglePasswordVisibility: sources.form.togglePasswordVisibility,
    submit: sources.submission.submit,
  };
}

/** Composes verification, form state and submission for the accept page. */
export function useInvitationAccept(): InvitationAcceptController {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const detailsState = useInvitationDetails(token);
  const form = useInvitationForm();
  const submission = useInvitationSubmission({
    token,
    form,
    onAlreadyAccepted: detailsState.markAlreadyAccepted,
  });

  const loadedName = detailsState.details?.name ?? null;
  const setName = form.setName;
  useEffect(() => {
    if (loadedName !== null) {
      setName(loadedName);
    }
  }, [loadedName, setName]);

  const view = resolveInvitationView({
    isLoadingDetails: detailsState.isLoadingDetails,
    isAlreadyAccepted: detailsState.isAlreadyAccepted,
    fetchError: detailsState.fetchError,
    details: detailsState.details,
  });

  return toController({ view, form, submission });
}
