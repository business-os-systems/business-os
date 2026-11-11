"use client";

import React from "react";
import type { CmsAppearanceThemeDto } from "@/lib/api/site-client";

export interface AppearanceThemeGalleryProps {
  readonly themes: readonly CmsAppearanceThemeDto[];
  readonly selectedThemeId: string | null;
  readonly isSaving: boolean;
  readonly onSelect: (themeId: string) => Promise<void>;
}

type ThemeCardState = "selected" | "idle";

const CARD_BASE =
  "group w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60";
const CARD_CLASS_BY_STATE = {
  selected: "border-brand bg-brand-tint/50",
  idle: "border-border bg-surface hover:border-border-strong hover:bg-surface-hover",
} as const satisfies Record<ThemeCardState, string>;
const CARD_LABEL_BY_STATE = {
  selected: "Selected theme",
  idle: "Use this theme",
} as const satisfies Record<ThemeCardState, string>;

function ThemeSwatches({ theme }: { readonly theme: CmsAppearanceThemeDto }) {
  return (
    <span className="mt-2 flex h-8 overflow-hidden rounded-md border border-border" aria-hidden="true">
      <span className="w-1/2" style={{ backgroundColor: theme.tokens.colorBackground }} />
      <span className="w-1/4" style={{ backgroundColor: theme.tokens.colorPrimary }} />
      <span className="w-1/4" style={{ backgroundColor: theme.tokens.colorSurface }} />
    </span>
  );
}

function ThemeCard(props: {
  readonly theme: CmsAppearanceThemeDto;
  readonly state: ThemeCardState;
  readonly isSaving: boolean;
  readonly onSelect: (themeId: string) => Promise<void>;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.state === "selected"}
      disabled={props.isSaving}
      onClick={() => void props.onSelect(props.theme.id)}
      className={CARD_BASE + " " + CARD_CLASS_BY_STATE[props.state]}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold text-text">{props.theme.name}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
          {props.theme.category}
        </span>
      </span>
      <ThemeSwatches theme={props.theme} />
      <span className="mt-1.5 block text-[10px] text-text-muted">
        {CARD_LABEL_BY_STATE[props.state]}
      </span>
    </button>
  );
}

/** Theme gallery fed entirely by the published catalog (FR-151). */
export function AppearanceThemeGallery(props: AppearanceThemeGalleryProps) {
  return (
    <section aria-label="Theme gallery" className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Theme gallery
        </h3>
        <p className="mt-1 text-[11px] text-text-muted">
          Selecting a theme copies its tokens onto this site. Later catalog changes do not restyle it.
        </p>
      </div>

      {props.themes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-4 text-xs text-text-muted">
          No published themes are available to this workspace yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {props.themes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              state={theme.id === props.selectedThemeId ? "selected" : "idle"}
              isSaving={props.isSaving}
              onSelect={props.onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}
