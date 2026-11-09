"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthCredentialsData } from "@/components/auth/shared/credentials";
import { requestLogin } from "./login-service";
import { resolveLoginDestination } from "./login-destination";
import {
  applyThemePreference,
  clearLoginQueryParams,
  readRedirectParam,
} from "./login-query";

export interface LoginSubmitController {
  errorMessage: string | null;
  isLoading: boolean;
  clearError: () => void;
  submit: (credentials: AuthCredentialsData) => Promise<void>;
}

/**
 * Owns the sign-in mutation: submission, error state, theme hand-off and
 * navigation. The credential form receives a synchronous wrapper so the
 * submit callback never returns a floating promise (P12).
 */
export function useLoginSubmit(
  initialMessage: string | null
): LoginSubmitController {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(initialMessage);
  const [isLoading, setIsLoading] = useState(false);

  const clearError = useCallback((): void => {
    setErrorMessage(null);
    clearLoginQueryParams();
  }, []);

  const submit = useCallback(
    async (credentials: AuthCredentialsData): Promise<void> => {
      setErrorMessage(null);
      setIsLoading(true);

      const outcome = await requestLogin(credentials);
      if (outcome.kind === "failure") {
        setErrorMessage(outcome.message);
        setIsLoading(false);
        return;
      }

      applyThemePreference(outcome.payload.themePreference);
      router.push(
        resolveLoginDestination(outcome.payload, readRedirectParam())
      );
      router.refresh();
    },
    [router]
  );

  return { errorMessage, isLoading, clearError, submit };
}