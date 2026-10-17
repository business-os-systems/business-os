"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@suite/ui";
import { PasskeyIcon } from "@suite/ui/icons";
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
  onActionTrigger?: () => void;
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
  onActionTrigger,
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
    onActionTrigger?.();
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
    <Button
      type="button"
      variant="secondary"
      size="sm"
      fullWidth
      isLoading={isLoading}
      onClick={handlePasskeyLogin}
      disabled={disabled || isLoading}
      startIcon={<PasskeyIcon size={16} className="text-action shrink-0" aria-hidden="true" />}
      className="text-xs"

    >
      <span>{isLoading ? "Authenticating Passkey..." : "Sign in with Passkey / Biometrics"}</span>
    </Button>
  );
}
