import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { ValidationError } from "@suite/core/errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRequestOptions(
  value: Record<string, unknown>
): value is PublicKeyCredentialRequestOptionsJSON & Record<string, unknown> {
  return (
    typeof value.challenge === "string" &&
    typeof value.rpId === "string" &&
    Array.isArray(value.allowCredentials) &&
    typeof value.timeout === "number" &&
    typeof value.userVerification === "string"
  );
}

function isCreationOptions(
  value: Record<string, unknown>
): value is PublicKeyCredentialCreationOptionsJSON & Record<string, unknown> {
  return (
    typeof value.challenge === "string" &&
    isRecord(value.rp) &&
    isRecord(value.user) &&
    Array.isArray(value.pubKeyCredParams) &&
    typeof value.timeout === "number" &&
    typeof value.attestation === "string"
  );
}

export function parseRequestOptions(
  value: Record<string, unknown>
): PublicKeyCredentialRequestOptionsJSON {
  if (!isRequestOptions(value)) {
    throw new ValidationError("The passkey sign-in options are malformed");
  }
  return value;
}

export function parseCreationOptions(
  value: Record<string, unknown>
): PublicKeyCredentialCreationOptionsJSON {
  if (!isCreationOptions(value)) {
    throw new ValidationError("The passkey registration options are malformed");
  }
  return value;
}
