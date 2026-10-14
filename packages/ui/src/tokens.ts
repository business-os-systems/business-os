/**
 * Enterprise Business OS Design Tokens
 * Source of truth: DESIGN.md v2.0.0
 * Warm-stone surfaces, terracotta identity, teal actions, tabular numerics, WCAG 2.2 AA throughout.
 */

export const THEME_COLORS = {
  // Canvas & structure
  background: "#FAF3EF",
  surface: "#FFFFFF",
  "surface-muted": "#F3EFEC",
  "surface-sunken": "#EDE6E1",
  "surface-hover": "#F7F0EC",
  border: "#E9E2DE",
  "border-strong": "#8C7E78",
  "border-hover": "#D8CFC9",
  scrim: "rgba(30, 27, 25, 0.45)",

  // Content
  text: "#1E1B19",
  "text-secondary": "#5C504B",
  "text-muted": "#6E625D",
  "text-disabled": "#A89C96",
  "text-inverse": "#FFFFFF",

  // Brand (identity, navigation state)
  brand: "#A43A2B",
  "brand-hover": "#8F3024",
  "brand-active": "#7A281D",
  "brand-tint": "#F8E5DE",
  "on-brand": "#FFFFFF",

  // Action (the one primary action per view)
  action: "#0F766E",
  "action-hover": "#115E59",
  "action-active": "#134E4A",
  "action-tint": "rgba(15, 118, 110, 0.12)",
  "on-action": "#FFFFFF",
  "focus-ring": "#0D9488",

  // Status
  success: "#0F766E",
  warning: "#B45309",
  "warning-fill": "#F59E0B",
  "warning-text": "#92400E",
  danger: "#B91C1C",
  info: "#5C504B",

  // Compatibility bridges
  primary: "#A43A2B",
  "on-primary": "#FFFFFF",
  secondary: "#0F766E",
  "on-secondary": "#FFFFFF",
  "border-hairline": "#E9E2DE",
  "surface-brand-tint": "#F8E5DE",
} as const;

export const THEME_COLORS_DARK = {
  background: "#1A1715",
  surface: "#24201E",
  "surface-muted": "#2E2926",
  "surface-sunken": "#14110F",
  "surface-hover": "#2A2522",
  border: "#3D3633",
  "border-strong": "#7A6D67",
  "border-hover": "#544A45",
  scrim: "rgba(0, 0, 0, 0.60)",

  text: "#F3ECE8",
  "text-secondary": "#C4B8B2",
  "text-muted": "#A09089",
  "text-disabled": "#6B5F59",
  "text-inverse": "#1A1715",

  brand: "#C4503F",
  "brand-hover": "#D4604F",
  "brand-active": "#B24433",
  "brand-tint": "#4A2A24",
  "brand-text": "#E0705F",
  "on-brand": "#FFFFFF",

  action: "#2DD4BF",
  "action-hover": "#5EEAD4",
  "action-active": "#14B8A6",
  "action-tint": "rgba(45, 212, 191, 0.16)",
  "on-action": "#04201D",
  "focus-ring": "#5EEAD4",

  success: "#2DD4BF",
  warning: "#FBBF24",
  "warning-fill": "#FBBF24",
  "warning-text": "#FBBF24",
  danger: "#F87171",
  info: "#C4B8B2",
} as const;

export const THEME_TYPOGRAPHY = {
  fontSans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  display: {
    fontSize: "2.5rem",
    fontWeight: "700",
    lineHeight: "3rem",
    letterSpacing: "-0.025em",
  },
  "headline-xl": {
    fontSize: "2rem",
    fontWeight: "700",
    lineHeight: "2.5rem",
    letterSpacing: "-0.02em",
  },
  "headline-xl-mobile": {
    fontSize: "1.5rem",
    fontWeight: "700",
    lineHeight: "2rem",
    letterSpacing: "-0.015em",
  },
  "headline-lg": {
    fontSize: "1.5rem",
    fontWeight: "600",
    lineHeight: "2rem",
    letterSpacing: "-0.015em",
  },
  "headline-md": {
    fontSize: "1.25rem",
    fontWeight: "600",
    lineHeight: "1.75rem",
    letterSpacing: "-0.01em",
  },
  "headline-sm": {
    fontSize: "1.125rem",
    fontWeight: "600",
    lineHeight: "1.5rem",
    letterSpacing: "-0.005em",
  },
  "title-md": {
    fontSize: "1rem",
    fontWeight: "600",
    lineHeight: "1.5rem",
    letterSpacing: "0em",
  },
  "body-lg": {
    fontSize: "1rem",
    fontWeight: "400",
    lineHeight: "1.5rem",
    letterSpacing: "0em",
  },
  "body-md": {
    fontSize: "0.875rem",
    fontWeight: "400",
    lineHeight: "1.25rem",
    letterSpacing: "0em",
  },
  "body-sm": {
    fontSize: "0.75rem",
    fontWeight: "400",
    lineHeight: "1rem",
    letterSpacing: "0.01em",
  },
  "label-md": {
    fontSize: "0.875rem",
    fontWeight: "500",
    lineHeight: "1.25rem",
    letterSpacing: "0.005em",
  },
  "label-sm": {
    fontSize: "0.75rem",
    fontWeight: "600",
    lineHeight: "1rem",
    letterSpacing: "0.02em",
  },
  "code-sm": {
    fontFamily: "mono",
    fontSize: "0.8125rem",
    fontWeight: "500",
    lineHeight: "1.125rem",
  },
  numericFeatures: '"tnum" on, "cv01" on',
} as const;

export const THEME_ROUNDED = {
  none: "0",
  xs: "0.125rem",
  sm: "0.25rem",
  DEFAULT: "0.5rem",
  md: "0.75rem",
  lg: "1rem",
  xl: "1.5rem",
  full: "9999px",
} as const;

export const THEME_SPACING = {
  gutter: "1rem",
  "gutter-desktop": "1.5rem",
  margin: "1rem",
  "margin-desktop": "2rem",
  "space-xs": "0.25rem",
  "space-sm": "0.5rem",
  "space-md": "1rem",
  "space-lg": "1.5rem",
  "space-xl": "2rem",
} as const;
