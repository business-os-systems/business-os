import { isProduction } from "@/lib/env";
import { isTurnstileConfigured, verifyTurnstileToken } from "@/lib/turnstile";

export interface BotChallengeInput {
  readonly token?: string | null;
  readonly clientIp?: string;
}

/**
 * Applies the Cloudflare Turnstile gate exactly when the environment or the
 * client supplied a token. Returns a boolean so transport code maps the
 * refusal to its own RFC 7807 envelope.
 */
export async function verifyBotChallenge(input: BotChallengeInput): Promise<boolean> {
  const isBotDefenseRequired = isProduction && isTurnstileConfigured();
  if (!isBotDefenseRequired && !(isTurnstileConfigured() && input.token)) {
    return true;
  }
  const result = await verifyTurnstileToken(input.token, input.clientIp);
  return result.success;
}
