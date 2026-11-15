"use client";

import { useMemo } from "react";
import {
  DEFAULT_APPEARANCE_TOKENS,
  normalizeAppearanceTokens,
  type AppearanceTokens,
} from "@suite/website-builder/appearance";
import { useCatalogItems } from "./use-catalog-items";

export interface PreviewThemeOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Published themes of one application, for the preview selector. Reading the
 * list is enough: a theme's tokens come from the record the list already
 * carries, and a legacy or partial set is normalised before it renders.
 */
export function useCatalogPreviewTheme(appId: string, enabled: boolean) {
  const items = useCatalogItems({ appId, kind: "THEME", enabled });

  const published = useMemo(
    () => items.items.filter((item) => item.status === "ACTIVE"),
    [items.items]
  );

  const options = useMemo<PreviewThemeOption[]>(
    () => published.map((item) => ({ id: item.id, name: item.name })),
    [published]
  );

  function tokensFor(themeId: string | null): AppearanceTokens {
    if (themeId === null) {
      return DEFAULT_APPEARANCE_TOKENS;
    }
    const selected = published.find((item) => item.id === themeId);
    if (selected === undefined) {
      return DEFAULT_APPEARANCE_TOKENS;
    }
    return normalizeAppearanceTokens(selected.definition.tokens);
  }

  return { options, tokensFor, isLoading: items.isLoading, error: items.error };
}
