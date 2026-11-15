"use client";

import { useState } from "react";
import { parseCatalogDefinition, type CatalogDraft } from "@/lib/catalog-schema";
import { CatalogSectionPreview } from "./catalog-section-preview";
import type { CatalogPreviewWidthId } from "./catalog-preview-frame";
import { useCatalogPreviewTheme } from "./use-catalog-preview-theme";

export interface CatalogEditorSectionPaneProps {
  readonly appId: string;
  readonly draft: CatalogDraft;
}

/** The preview half of the section editor: theme, width and the rendered block. */
export function CatalogEditorSectionPane(props: CatalogEditorSectionPaneProps) {
  const preview = useCatalogPreviewTheme(props.appId, true);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [widthId, setWidthId] = useState<CatalogPreviewWidthId>("fit");

  const parsed = parseCatalogDefinition("SECTION", props.draft.definition);
  const block = parsed.ok && parsed.parsed.kind === "SECTION" ? parsed.parsed.definition.block : null;

  return (
    <CatalogSectionPreview
      block={block}
      tokens={preview.tokensFor(themeId)}
      themes={preview.options}
      themeId={themeId}
      widthId={widthId}
      onThemeChange={setThemeId}
      onWidthChange={setWidthId}
    />
  );
}
