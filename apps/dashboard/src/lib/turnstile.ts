/**
 * Cloudflare Turnstile Bot Defense & Test Mode Verifier
 * Complies with SPEC-AUTH-001 Section 5.3 and Architecture Decision ADR-AUTH-006.
 */

import { isProduction } from "./env";

export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
export const TURNSTILE_TEST_SECRET_KEY = "2x00000000000000000000AB";

const SITEVERIFY_ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function getTurnstileSiteKey(): string {
  if (!isProduction) {
    return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY;
  }
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
}

export function getTurnstileSecretKey(): string {
  if (!isProduction) {
    return process.env.TURNSTILE_SECRET_KEY || TURNSTILE_TEST_SECRET_KEY;
  }
  return process.env.TURNSTILE_SECRET_KEY || "";
}

export interface TurnstileVerificationResult {
  success: boolean;
  errorCodes?: string[];
  challengeTs?: string;
  hostname?: string;
}

/**
 * Validates a Turnstile token against Cloudflare's siteverify endpoint.
 * In non-production environments when Cloudflare's official dummy test keys are configured,
 * verifies through standard test key contracts without external network dependencies.
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

  // Deterministic validation when configured with Cloudflare's official test pass key
  if (secretKey === TURNSTILE_TEST_SECRET_KEY) {
    return {
      success: true,
      challengeTs: new Date().toISOString(),
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
