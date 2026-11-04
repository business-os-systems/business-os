/**
 * Cloudflare Turnstile Bot Defense Verifier
 * Complies with SPEC-AUTH-001 Section 5.3 and Architecture Decision ADR-AUTH-006.
 * Zero hardcoded credentials, test keys, or magic strings (Constitution Principle XII).
 */

import { isTemplateSecret } from "@suite/core";
import { isProduction } from "./env";

const SITEVERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function getTurnstileSiteKey(): string {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return typeof key === "string" ? key.trim() : "";
}

export function getTurnstileSecretKey(): string {
  const key = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (key === undefined || key.length === 0) {
    return "";
  }
  if (process.env.NODE_ENV === "production" && isTemplateSecret(key)) {
    throw new Error(
      "TURNSTILE_SECRET_KEY still holds a published template value. Generate a real secret before starting in production."
    );
  }
  return key;
}

export function isTurnstileConfigured(): boolean {
  return Boolean(getTurnstileSiteKey() && getTurnstileSecretKey());
}

export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
}

/**
 * Validates a Turnstile token against Cloudflare's siteverify endpoint.
 * When unconfigured in local development, safely bypasses external checks.
 * In production, strictly enforces valid token verification.
 */
export async function verifyTurnstileToken(
  token?: string | null,
  clientIp?: string | null
): Promise<TurnstileVerificationResult> {
  if (!token || typeof token !== "string" || token.trim().length === 0) {
    return {
      success: false,
      errorCodes: ["missing-input-response"],
    };
  }

  const secretKey = getTurnstileSecretKey();
  if (!secretKey) {
    if (!isProduction) {
      return {
        success: true,
        challengeTs: new Date().toISOString(),
      };
    }
    return {
      success: false,
      errorCodes: ["missing-turnstile-secret"],
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", secretKey);
    formData.append("response", token);
    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const response = await fetch(SITEVERIFY_ENDPOINT, {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        errorCodes: [`http-status-${response.status}`],
      };
    }

    const data = (await response.json()) as {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    return {
      success: Boolean(data.success),
      errorCodes: data["error-codes"],
      challengeTs: data.challenge_ts,
      hostname: data.hostname,
    };
  } catch (error) {
    return {
      success: false,
      errorCodes: [error instanceof Error ? error.message : "verification-error"],
    };
  }
}
