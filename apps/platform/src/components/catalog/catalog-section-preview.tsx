"use client";

import { Select } from "@suite/ui";
import { SectionRenderer, ThemeProvider } from "@suite/website-builder/render";
import type { AppearanceTokens } from "@suite/website-builder/appearance";
import type { BlockAst } from "@suite/website-builder/ast";
import {
  CatalogPreviewFrame,
  CatalogPreviewWidthControl,
  type CatalogPreviewWidthId,
} from "./catalog-preview-frame";

export interface SectionPreviewThemeOption {
  readonly id: string;
  readonly name: string;
}

export interface CatalogSectionPreviewProps {
  readonly block: BlockAst | null;
  readonly tokens: AppearanceTokens;
  readonly themes: readonly SectionPreviewThemeOption[];
  readonly themeId: string | null;
  readonly widthId: CatalogPreviewWidthId;
  readonly onThemeChange: (themeId: string | null) => void;
  readonly onWidthChange: (widthId: CatalogPreviewWidthId) => void;
}

const PLATFORM_THEME_ID = "platform-default";

function themeOptions(themes: readonly SectionPreviewThemeOption[]) {
  return [
    { value: PLATFORM_THEME_ID, label: "Platform default appearance" },
    ...themes.map((theme) => ({ value: theme.id, label: theme.name })),
  ];
}

/** One section, rendered through the production renderer inside a theme. */
export function CatalogSectionPreview(props: CatalogSectionPreviewProps) {
  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Preview in theme
          </span>
          <Select
            aria-label="Preview theme"
            value={props.themeId ?? PLATFORM_THEME_ID}
            options={themeOptions(props.themes)}
            onChange={(next) => props.onThemeChange(next === PLATFORM_THEME_ID ? null : next)}
            className="w-56"
          />
        </div>
        <CatalogPreviewWidthControl widthId={props.widthId} onWidthChange={props.onWidthChange} />
      </div>

      {props.block === null ? (
        <p className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          The section payload is not valid, so it cannot be previewed.
        </p>
      ) : (
        <CatalogPreviewFrame
          widthId={props.widthId}
          caption="Only this section is shown. The page around it is not part of a section preview."
        >
          <div className="relative h-full">
            <span className="absolute left-0 top-0 z-10 rounded-br-md bg-brand-tint px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-brand">
              Section bounds
            </span>
            <div className="h-full outline-dashed outline-1 outline-offset-[-1px] outline-brand/40">
              <ThemeProvider tokens={props.tokens}>
                <SectionRenderer
                  section={{ id: "catalog-preview-section", blocks: [props.block] }}
                />
              </ThemeProvider>
            </div>
          </div>
        </CatalogPreviewFrame>
      )}
    </div>
  );
}
