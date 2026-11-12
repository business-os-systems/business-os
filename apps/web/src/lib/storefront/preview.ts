/**
 * The preview token a signed storefront link carries (FR-037). Only one token
 * is accepted, it is bounded, and an absent, repeated or oversized value is
 * treated as no preview rather than as an error the visitor can probe.
 */
export const PREVIEW_TOKEN_QUERY_PARAM = "preview";

const MAX_PREVIEW_TOKEN_LENGTH = 4096;

export type StorefrontSearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export async function readPreviewToken(
  searchParams: StorefrontSearchParams
): Promise<string | null> {
  const params = await searchParams;
  const raw = params[PREVIEW_TOKEN_QUERY_PARAM];
  if (typeof raw !== "string") {
    return null;
  }
  const token = raw.trim();
  if (token.length === 0 || token.length > MAX_PREVIEW_TOKEN_LENGTH) {
    return null;
  }
  return token;
}
