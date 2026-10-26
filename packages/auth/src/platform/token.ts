import {
  computeHmacSha256,
  constantTimeEqual,
  decodeBase64UrlText,
  encodeBase64UrlText,
} from "../crypto/hmac.js";

/**
 * Signs a Platform token. The two-part payload.signature format is shared with
 * the tenant session token so both planes use the same HMAC primitives.
 */
export async function signPlatformToken(
  payload: unknown,
  secret: string
): Promise<string> {
  if (secret.trim() === "") {
    throw new Error("A Platform signing secret is required");
  }
  const encoded = encodeBase64UrlText(JSON.stringify(payload));
  const signature = await computeHmacSha256(encoded, secret);
  return `${encoded}.${signature}`;
}

export async function verifyPlatformToken(
  token: string,
  secret: string
): Promise<unknown | null> {
  if (secret.trim() === "") {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encoded, signature] = parts;
  if (!encoded || !signature) {
    return null;
  }
  const expected = await computeHmacSha256(encoded, secret);
  if (!constantTimeEqual(signature, expected)) {
    return null;
  }
  const json = decodeBase64UrlText(encoded);
  if (json === null) {
    return null;
  }
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}
