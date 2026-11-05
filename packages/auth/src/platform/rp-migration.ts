/**
 * Relying-party identity migration for Platform operator passkeys.
 *
 * A WebAuthn credential is bound to the relying-party ID (RP ID) that enrolled
 * it. When the control plane moves to a new operator domain the configured RP
 * ID changes, and a credential enrolled under the old identity must not be
 * treated as a valid sign-in. This module owns that decision so the API can
 * deny with one explicit "re-enrolment required" outcome instead of a generic
 * authentication failure.
 *
 * The module is deliberately storage-free: the caller reads the binding that
 * was recorded on the passkey at enrolment and passes it in.
 */

/**
 * A passkey enrolled before the binding was recorded has no stored RP ID. It is
 * "unbound", not stale: the WebAuthn ceremony itself still proves which RP the
 * authenticator accepted, so the caller may verify and then stamp the binding.
 */
export type RelyingPartyBinding =
  | { readonly state: "current" }
  | { readonly state: "unbound" }
  | {
      readonly state: "re_enrolment_required";
      readonly currentRpID: string;
      readonly enrolledRpID: string;
    };

export interface AssessRelyingPartyBindingInput {
  readonly currentRpID: string;
  readonly enrolledRpID: string | null | undefined;
}

const ALLOWED_LABEL_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-";
const MAXIMUM_LABEL_LENGTH = 63;
const MAXIMUM_RP_ID_LENGTH = 253;

function isIpv4Address(value: string): boolean {
  const octets = value.split(".");
  if (octets.length !== 4) {
    return false;
  }
  return octets.every(
    (octet) =>
      octet !== "" &&
      octet.length <= 3 &&
      [...octet].every((character) => "0123456789".includes(character)) &&
      Number(octet) <= 255
  );
}

function isDomainLabel(label: string): boolean {
  if (label.length === 0 || label.length > MAXIMUM_LABEL_LENGTH) {
    return false;
  }
  if (label.startsWith("-") || label.endsWith("-")) {
    return false;
  }
  return [...label].every((character) =>
    ALLOWED_LABEL_CHARACTERS.includes(character)
  );
}

export function normalizeRelyingPartyId(rpID: string): string {
  const trimmed = rpID.trim().toLowerCase();
  if (trimmed === "") {
    throw new RangeError("A relying-party ID must not be empty");
  }
  const withoutRootDot = trimmed.endsWith(".")
    ? trimmed.slice(0, -1)
    : trimmed;
  if (withoutRootDot.length > MAXIMUM_RP_ID_LENGTH) {
    throw new RangeError("A relying-party ID must be at most 253 characters");
  }
  if (!withoutRootDot.split(".").every(isDomainLabel)) {
    throw new RangeError("A relying-party ID must be a domain name");
  }
  if (isIpv4Address(withoutRootDot)) {
    throw new RangeError(
      "A relying-party ID must be a domain name, not an IP address"
    );
  }
  return withoutRootDot;
}

function parseStoredRelyingPartyId(value: string): string | null {
  try {
    return normalizeRelyingPartyId(value);
  } catch {
    // A corrupt or hand-edited binding must deny, never turn sign-in into a 500.
    return null;
  }
}

export function assessRelyingPartyBinding(
  input: AssessRelyingPartyBindingInput
): RelyingPartyBinding {
  const current = normalizeRelyingPartyId(input.currentRpID);
  const enrolled = input.enrolledRpID?.trim() ?? "";
  if (enrolled === "") {
    return { state: "unbound" };
  }
  const enrolledRpID = parseStoredRelyingPartyId(enrolled);
  if (enrolledRpID === current) {
    return { state: "current" };
  }
  return {
    state: "re_enrolment_required",
    currentRpID: current,
    enrolledRpID: enrolledRpID ?? enrolled,
  };
}
