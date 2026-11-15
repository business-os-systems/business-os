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

/** The subset of a catalog item this hook needs, kept small for testing. */
export interface PreviewThemeSource {
  readonly id: string;
  readonly definition: Record<string, unknown>;
}

/**
 * A theme's tokens, normalised before rendering. A missing theme falls back to
 * the platform appearance, and a partial or legacy set fills its defaults.
 */
export function previewTokensFor(
  sources: readonly PreviewThemeSource[],
  themeId: string | null
): AppearanceTokens {
  if (themeId === null) {
    return DEFAULT_APPEARANCE_TOKENS;
  }
  const selected = sources.find((source) => source.id === themeId);
  if (selected === undefined) {
    return DEFAULT_APPEARANCE_TOKENS;
  }
  return normalizeAppearanceTokens(selected.definition.tokens);
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

  return {
    options,
    tokensFor: (themeId: string | null) => previewTokensFor(published, themeId),
    isLoading: items.isLoading,
    error: items.error,
  };
}
