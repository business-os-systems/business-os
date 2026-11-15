import React from "react";
import {
  appearanceCssVariables,
  normalizeAppearanceTokens,
  responsiveTextRoleStyles,
  type AppearanceTokens,
} from "../appearance/index.js";

/**
 * Computed once: the rules reference the provider's own variables, so the same
 * string is correct for every site and no render recomputes it.
 */
const RESPONSIVE_TEXT_RULES = responsiveTextRoleStyles();

export interface ThemeProviderProps {
  /** The site's stored token snapshot; incomplete snapshots receive defaults. */
  readonly tokens: AppearanceTokens | Readonly<Record<string, unknown>>;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/**
 * Applies a site's own appearance snapshot as CSS custom properties (T115).
 *
 * The provider is the only place that turns stored tokens into presentation.
 * It emits variables rather than utility classes, so a site's palette can never
 * leak into another site and no raw palette class is written here (FR-153).
 */
export function ThemeProvider({ tokens, children, className = "" }: ThemeProviderProps) {
  const resolved = normalizeAppearanceTokens(tokens);
  const variables = appearanceCssVariables(resolved);

  return (
    <div
      data-cms-theme="true"
      className={className}
      style={{
        ...variables,
        backgroundColor: "var(--cms-color-background)",
        color: "var(--cms-color-text)",
        fontFamily: "var(--cms-font-body)",
      }}
    >
      <style>{RESPONSIVE_TEXT_RULES}</style>
      {children}
    </div>
  );
}
