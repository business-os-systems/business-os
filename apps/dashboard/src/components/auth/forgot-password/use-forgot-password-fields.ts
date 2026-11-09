"use client";

import { useCallback, useState } from "react";
import { useTurnstileConfig } from "@/lib/turnstile-client";

export interface ForgotPasswordFields {
  email: string;
  turnstileToken: string | null;
  turnstileSiteKey: string;
  isTurnstileConfigured: boolean;
  setEmail: (value: string) => void;
  setTurnstileToken: (token: string | null) => void;
}

/** Email and bot-defense state for the recovery form. */
export function useForgotPasswordFields(): ForgotPasswordFields {
  const [email, setEmailValue] = useState("");
  const [turnstileToken, setTurnstileTokenValue] = useState<string | null>(null);
  const turnstileConfig = useTurnstileConfig();

  const setEmail = useCallback((value: string): void => {
    setEmailValue(value);
  }, []);
  const setTurnstileToken = useCallback((token: string | null): void => {
    setTurnstileTokenValue(token);
  }, []);

  return {
    email,
    turnstileToken,
    turnstileSiteKey: turnstileConfig.siteKey,
    isTurnstileConfigured: turnstileConfig.isConfigured,
    setEmail,
    setTurnstileToken,
  };
}
