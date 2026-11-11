/** Brand basics shared by the API boundary and the appearance panel. */
export const BRAND_LOGO_URL_MAX_LENGTH = 2048;

const SAFE_RELATIVE_PATH_CHARACTERS: ReadonlySet<string> = new Set(
  "/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._~-!$&'()*+,;=:@%"
);

function isSafeRelativeLogoPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return false;
  }
  return [...value].every((character) => SAFE_RELATIVE_PATH_CHARACTERS.has(character));
}

function isSafeAbsoluteLogoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/**
 * A logo is a workspace-relative media path or an absolute HTTPS URL. Data
 * URLs, javascript: and protocol-relative values are refused so the value can
 * be rendered as an <img src> without becoming an injection sink.
 */
export function isSafeBrandLogoUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > BRAND_LOGO_URL_MAX_LENGTH) {
    return false;
  }
  if (trimmed.startsWith("/")) {
    return isSafeRelativeLogoPath(trimmed);
  }
  return isSafeAbsoluteLogoUrl(trimmed);
}
