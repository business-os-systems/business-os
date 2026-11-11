/**
 * Shared URL safety for storefront metadata. Only an absolute http(s) URL may
 * reach a rendered attribute, so a javascript:, data: or relative value is
 * dropped instead of injected (FR-041, P17).
 */
export function toSafeHttpUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.toString();
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      return null;
    }
    throw error;
  }
}
