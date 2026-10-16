"use client";

import React, { useState, useEffect } from "react";
import { isBrowser } from "@/lib/env";

/**
 * Verified passkey session payload returned from verification gateway.
 */
export interface PasskeyVerificationResult {
  success: boolean;
  redirectUrl?: string;
  themePreference?: "light" | "dark" | "system";
  user?: {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    roleSlug?: string;
    permissions?: string[];
    organizationId?: string;
    organizationName?: string;
    onboardingStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
    currentOnboardingStep?: number;
  };
}

/**
 * FIDO2 / WebAuthn outcome callback handlers (ISP).
 */
export interface PasskeyEventHandlers {
  onSuccess?: (result: PasskeyVerificationResult) => void;
  onError?: (error: Error) => void;
}

/**
 * UI interaction state for passkey trigger (ISP).
 */
export interface PasskeyStateProps {
  disabled?: boolean;
  turnstileToken?: string | null;
  verifyEndpoint?: string;
}

/**
 * Composite PasskeyButton properties.
 */
export interface PasskeyButtonProps
  extends PasskeyEventHandlers,
    PasskeyStateProps {}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      binary += String.fromCharCode(byte);
    }
  }
  return btoa(binary);
}

export function PasskeyButton({
  onSuccess,
  onError,
  disabled = false,
  turnstileToken,
  verifyEndpoint = "/api/auth/passkey/verify",
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
      if (!isBrowser || !navigator.credentials) {
        throw new Error("WebAuthn / Passkeys are not supported in this browser environment.");
      }

      // Trigger browser FIDO2 / WebAuthn prompt
      const challenge = new Uint8Array(32);
      if (window.crypto) {
        window.crypto.getRandomValues(challenge);
      }

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: "preferred",
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("No passkey credential received from authenticator.");
      }

      let responsePayload: Record<string, unknown> = {};
      if (credential.response) {
        const assertion = credential.response as AuthenticatorAssertionResponse;
        responsePayload = {
          clientDataJSON: assertion.clientDataJSON
            ? arrayBufferToBase64(assertion.clientDataJSON)
            : undefined,
          authenticatorData: assertion.authenticatorData
            ? arrayBufferToBase64(assertion.authenticatorData)
            : undefined,
          signature: assertion.signature
            ? arrayBufferToBase64(assertion.signature)
            : undefined,
          userHandle: assertion.userHandle
            ? arrayBufferToBase64(assertion.userHandle)
            : undefined,
        };
      }

      const rawIdBase64 = credential.rawId
        ? arrayBufferToBase64(credential.rawId)
        : undefined;

      const response = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: credential.id,
          rawId: rawIdBase64,
          type: credential.type,
          response: responsePayload,
          turnstileToken,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.detail || data.title || "Passkey verification failed");
      }

      if (onSuccess) {
        onSuccess(data as PasskeyVerificationResult);
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
