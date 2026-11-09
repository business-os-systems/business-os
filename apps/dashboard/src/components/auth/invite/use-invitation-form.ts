"use client";

import { useCallback, useState } from "react";
import { useInvitationFieldValues } from "./use-invitation-field-values";

export interface InvitationFormState {
  name: string;
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  errorMessage: string | null;
  setName: (value: string) => void;
  setPassword: (value: string) => void;
  setConfirmPassword: (value: string) => void;
  togglePasswordVisibility: () => void;
  setErrorMessage: (value: string | null) => void;
  clearError: () => void;
}

/** Credential field, visibility and feedback state for the invitation form. */
export function useInvitationForm(): InvitationFormState {
  const values = useInvitationFieldValues();
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const togglePasswordVisibility = useCallback((): void => {
    setShowPassword((current) => !current);
  }, []);
  const clearError = useCallback((): void => {
    setErrorMessage(null);
  }, []);

  return {
    name: values.name,
    password: values.password,
    confirmPassword: values.confirmPassword,
    showPassword,
    errorMessage,
    setName: values.setName,
    setPassword: values.setPassword,
    setConfirmPassword: values.setConfirmPassword,
    togglePasswordVisibility,
    setErrorMessage,
    clearError,
  };
}
