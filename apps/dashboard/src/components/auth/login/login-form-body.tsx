"use client";

import React from "react";
import { EmailPasswordForm } from "@/components/auth/email-password-form";
import { OAuthProviders } from "@/components/auth/oauth-providers";
import type { AuthCredentialsData } from "@/components/auth/shared/credentials";

export interface LoginFormBodyProps {
  errorMessage: string | null;
  isLoading: boolean;
  onClearError: () => void;
  onSubmit: (credentials: AuthCredentialsData) => void;
}

/**
 * Presentational body of the sign-in card: OAuth fast paths plus the
 * email/password form. It owns no state and performs no fetching.
 */
export function LoginFormBody({
  errorMessage,
  isLoading,
  onClearError,
  onSubmit,
}: LoginFormBodyProps) {
  return (
    <>
      <OAuthProviders disabled={isLoading} onActionTrigger={onClearError} />
      <EmailPasswordForm
        mode="login"
        onSubmit={onSubmit}
        isLoading={isLoading}
        errorMessage={errorMessage}
        onClearError={onClearError}
      />
    </>
  );
}