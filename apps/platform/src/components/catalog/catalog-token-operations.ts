import { readPath, writeDraftPath } from "@/lib/catalog-paths";
import type { CatalogDraft } from "@/lib/catalog-schema";

const TOKENS_PATH = "definition.tokens";
const BLOCKED_TOKEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** A dangerous key never enters the token map (CWE-1321). */
export function isSafeTokenKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed !== "" && trimmed.length <= 128 && !BLOCKED_TOKEN_KEYS.has(trimmed);
}

export function readTokens(draft: CatalogDraft): Record<string, string | number> {
  const tokens = readPath(draft, TOKENS_PATH);
  if (typeof tokens !== "object" || tokens === null || Array.isArray(tokens)) {
    return {};
  }
  const result: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(tokens)) {
    if (isSafeTokenKey(key) && (typeof value === "string" || typeof value === "number")) {
      result[key] = value;
    }
  }
  return result;
}

export function withTokenValue(
  draft: CatalogDraft,
  key: string,
  value: string,
): CatalogDraft {
  if (!isSafeTokenKey(key)) {
    return draft;
  }
  return writeDraftPath(draft, TOKENS_PATH, { ...readTokens(draft), [key]: value });
}

export function withoutToken(draft: CatalogDraft, key: string): CatalogDraft {
  const tokens = readTokens(draft);
  const next: Record<string, string | number> = {};
  for (const [tokenKey, tokenValue] of Object.entries(tokens)) {
    if (tokenKey !== key) {
      next[tokenKey] = tokenValue;
    }
  }
  return writeDraftPath(draft, TOKENS_PATH, next);
}
