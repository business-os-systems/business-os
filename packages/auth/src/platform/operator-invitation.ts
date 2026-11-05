import { randomBytes } from "node:crypto";
import { sha256Hex } from "../crypto/hmac.js";

const OPERATOR_INVITATION_TOKEN_BYTES = 32;

export function createOperatorInvitationToken(): string {
  return randomBytes(OPERATOR_INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashOperatorInvitationToken(token: string): Promise<string> {
  return sha256Hex(token);
}
