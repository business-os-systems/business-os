"use client";

import React from "react";
import { ThemeProvider } from "@suite/website-builder/render";
import type { AppearanceTokens } from "@suite/website-builder/appearance";

export interface AppearancePreviewProps {
  readonly tokens: AppearanceTokens;
  readonly brandName: string;
  readonly brandLogoUrl: string | null;
}

const CARD_STYLE = {
  backgroundColor: "var(--cms-color-surface)",
  borderColor: "var(--cms-color-border)",
  borderRadius: "var(--cms-radius-lg)",
  boxShadow: "var(--cms-shadow-card)",
} as const;

const PRIMARY_BUTTON_STYLE = {
  backgroundColor: "var(--cms-color-primary)",
  color: "var(--cms-color-primary-contrast)",
  borderRadius: "var(--cms-radius-md)",
} as const;

const HEADING_STYLE = {
  fontFamily: "var(--cms-font-heading)",
  color: "var(--cms-color-text)",
} as const;

function PreviewBrand(props: {
  readonly brandName: string;
  readonly brandLogoUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      {props.brandLogoUrl === null ? null : (
        <img src={props.brandLogoUrl} alt="" className="h-7 w-7 rounded-sm object-contain" />
      )}
      <span className="text-sm font-semibold" style={HEADING_STYLE}>
        {props.brandName}
      </span>
    </div>
  );
}

function PreviewActions() {
  return (
    <div className="mt-4 flex items-center gap-2">
      <span
        className="inline-flex min-h-8 items-center px-3 py-1.5 text-xs font-semibold"
        style={PRIMARY_BUTTON_STYLE}
      >
        Primary action
      </span>
      <span
        className="inline-flex min-h-8 items-center border px-3 py-1.5 text-xs font-semibold"
        style={{
          borderColor: "var(--cms-color-border)",
          color: "var(--cms-color-accent)",
          borderRadius: "var(--cms-radius-md)",
        }}
      >
        Secondary
      </span>
    </div>
  );
}

function PreviewCard() {
  return (
    <div className="mt-5 border p-3" style={CARD_STYLE}>
      <p className="text-xs font-semibold" style={{ color: "var(--cms-color-text)" }}>
        Surface token
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "var(--cms-color-text-muted)" }}>
        Cards inherit the radius and shadow declared by this site.
      </p>
    </div>
  );
}

function PreviewStage(props: AppearancePreviewProps) {
  return (
    <div
      data-testid="appearance-preview"
      className="p-5"
      style={{
        backgroundColor: "var(--cms-color-background)",
        fontFamily: "var(--cms-font-body)",
        padding: "var(--cms-space-section)",
      }}
    >
      <PreviewBrand brandName={props.brandName} brandLogoUrl={props.brandLogoUrl} />
      <h4 className="mt-4 text-xl font-bold tracking-tight" style={HEADING_STYLE}>
        A site that looks like your brand
      </h4>
      <p className="mt-1.5 max-w-md text-xs" style={{ color: "var(--cms-color-text-muted)" }}>
        Headings, body copy, surfaces and actions all read from this site&apos;s own token snapshot.
      </p>
      <PreviewActions />
      <PreviewCard />
    </div>
  );
}

/**
 * A live preview built from the site's draft token snapshot. Every colour and
 * font comes from a CSS custom property emitted by ThemeProvider, so the
 * preview cannot drift from what the renderer will emit (FR-153, FR-154).
 */
export function AppearancePreview(props: AppearancePreviewProps) {
  return (
    <section aria-label="Appearance preview" className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Draft preview
        </h3>
        <p className="mt-1 text-[11px] text-text-muted">
          Visitors see the published snapshot until you publish these changes.
        </p>
      </div>
      <ThemeProvider tokens={props.tokens} className="overflow-hidden rounded-xl">
        <PreviewStage {...props} />
      </ThemeProvider>
    </section>
  );
}
