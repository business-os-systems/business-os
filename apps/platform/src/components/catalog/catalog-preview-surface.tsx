"use client";

import { useMemo, useState } from "react";
import { Alert, Button } from "@suite/ui";
import type { PageAst } from "@suite/website-builder/ast";
import { AstRenderer, SectionRenderer } from "@suite/website-builder/render";
import type { CatalogItem } from "@/lib/catalog-api";
import {
  parseCatalogDefinition,
  type ParsedCatalogDefinition,
} from "@/lib/catalog-schema";
import { CatalogThemePreview } from "./catalog-theme-preview";

export const CATALOG_PREVIEW_WIDTH_IDS = ["mobile", "tablet", "desktop"] as const;
export type CatalogPreviewWidthId = (typeof CATALOG_PREVIEW_WIDTH_IDS)[number];

interface PreviewViewport {
  readonly label: string;
  readonly width: number;
}

export const CATALOG_PREVIEW_VIEWPORTS = {
  mobile: { label: "Mobile (375px)", width: 375 },
  tablet: { label: "Tablet (768px)", width: 768 },
  desktop: { label: "Desktop (1280px)", width: 1280 },
} as const satisfies Record<CatalogPreviewWidthId, PreviewViewport>;

function TemplatePages({ pages }: { readonly pages: readonly PageAst[] }) {
  const [first, ...rest] = pages;
  if (first === undefined) {
    return null;
  }
  return (
    <>
      <AstRenderer ast={first} />
      {rest.length === 0 ? null : <TemplatePages pages={rest} />}
    </>
  );
}

function PreviewPayload({ parsed }: { readonly parsed: ParsedCatalogDefinition }) {
  switch (parsed.kind) {
    case "SECTION":
      return (
        <SectionRenderer
          section={{ id: "catalog-preview-section", blocks: [parsed.definition.block] }}
        />
      );
    case "TEMPLATE":
      return <TemplatePages pages={parsed.definition.pages} />;
    case "THEME":
      return <CatalogThemePreview tokens={parsed.definition.tokens} />;
  }
}

/**
 * Renders the actual stored payload through the production renderer at the
 * three supported device widths (FR-149). Widths are contained so a narrow
 * preview is visible beside the record chrome; the frame scrolls horizontally
 * rather than changing the operator's viewport.
 */
export function CatalogPreviewSurface({ item }: { readonly item: CatalogItem }) {
  const [widthId, setWidthId] = useState<CatalogPreviewWidthId>("desktop");
  const parsed = useMemo(
    () => parseCatalogDefinition(item.kind, item.definition),
    [item.kind, item.definition],
  );
  const viewport = CATALOG_PREVIEW_VIEWPORTS[widthId];

  if (!parsed.ok) {
    return (
      <Alert
        variant="error"
        title="The stored payload is not valid for its kind"
        message={
          <ul className="space-y-1">
            {parsed.issues.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                <span className="font-mono text-xs">{issue.path === "" ? "payload" : issue.path}</span>:{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Preview viewport">
        {CATALOG_PREVIEW_WIDTH_IDS.map((candidate) => (
          <Button
            key={candidate}
            type="button"
            size="sm"
            variant={candidate === widthId ? "default" : "secondary"}
            aria-pressed={candidate === widthId}
            onClick={() => setWidthId(candidate)}
          >
            {CATALOG_PREVIEW_VIEWPORTS[candidate].label}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface-sunken p-3">
        <div
          aria-label="Catalog preview frame"
          data-testid="catalog-preview-frame"
          data-preview-width={widthId}
          style={{ width: viewport.width }}
          className="mx-auto min-h-96 overflow-hidden rounded-md border border-border bg-surface"
        >
          <PreviewPayload parsed={parsed.parsed} />
        </div>
      </div>
    </div>
  );
}
