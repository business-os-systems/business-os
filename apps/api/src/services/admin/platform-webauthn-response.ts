import { ValidationError } from "@suite/core/errors";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasCredentialEnvelope(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.rawId === "string" &&
    value.type === "public-key" &&
    isRecord(value.response) &&
    isRecord(value.clientExtensionResults)
  );
}

function isRegistrationResponse(
  value: unknown
): value is RegistrationResponseJSON {
  return (
    hasCredentialEnvelope(value) &&
    isRecord(value) &&
    isRecord(value.response) &&
    typeof value.response.clientDataJSON === "string" &&
    typeof value.response.attestationObject === "string"
  );
}

function isAuthenticationResponse(
  value: unknown
): value is AuthenticationResponseJSON {
  return (
    hasCredentialEnvelope(value) &&
    isRecord(value) &&
    isRecord(value.response) &&
    typeof value.response.clientDataJSON === "string" &&
    typeof value.response.authenticatorData === "string" &&
    typeof value.response.signature === "string"
  );
}

export function parseRegistrationResponse(
  value: unknown
): RegistrationResponseJSON {
  if (!isRegistrationResponse(value)) {
    throw new ValidationError("The passkey registration response is malformed");
  }
  return value;
}

export function parseAuthenticationResponse(
  value: unknown
): AuthenticationResponseJSON {
  if (!isAuthenticationResponse(value)) {
    throw new ValidationError("The passkey sign-in response is malformed");
  }
  return value;
}
