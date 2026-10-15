"use client";

import React, { useState, useEffect } from "react";
import { isBrowser } from "@/lib/env";

/**
 * FIDO2 / WebAuthn outcome callback handlers (ISP).
 */
export interface PasskeyEventHandlers {
  onSuccess?: (credential: unknown) => void;
  onError?: (error: Error) => void;
}

/**
 * UI interaction state for passkey trigger (ISP).
 */
export interface PasskeyStateProps {
  disabled?: boolean;
}

/**
 * Composite PasskeyButton properties.
 */
export interface PasskeyButtonProps
  extends PasskeyEventHandlers,
    PasskeyStateProps {}

export function PasskeyButton({
  onSuccess,
  onError,
  disabled = false,
}: PasskeyButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (
      isBrowser &&
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential === "function"
    ) {
      setIsSupported(true);
    }
  }, []);

  const handlePasskeyLogin = async () => {
    if (disabled || isLoading) return;
    setIsLoading(true);
    try {
      if (isBrowser && navigator.credentials) {
        // Trigger browser FIDO2 / WebAuthn prompt
        const challenge = new Uint8Array(32);
        if (window.crypto) {
          window.crypto.getRandomValues(challenge);
        }

        const credential = await navigator.credentials.get({
          publicKey: {
            challenge,
            timeout: 60000,
            userVerification: "preferred",
          },
        });

        if (credential && onSuccess) {
          onSuccess(credential);
        }
      }
    } catch (err) {
      if (onError && err instanceof Error) {
        onError(err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handlePasskeyLogin}
      disabled={disabled || isLoading}
      className="w-full py-2 px-3 rounded-lg border border-border bg-surface hover:bg-surface-hover active:bg-surface-sunken text-text font-medium text-xs flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        className="w-4 h-4 text-action shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 004 11m0 0a8 8 0 008 8c.68 0 1.345-.04 2-.118"
        />
      </svg>
      <span>{isLoading ? "Authenticating Passkey..." : "Sign in with Passkey / Biometrics"}</span>
    </button>
  );
}
