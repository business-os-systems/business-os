"use client";

import { useMemo, useState } from "react";
import { Alert } from "@suite/ui";
import type { PageAst } from "@suite/website-builder/ast";
import { AstRenderer, SectionRenderer } from "@suite/website-builder/render";
import type { CatalogItem } from "@/lib/catalog-api";
import {
  parseCatalogDefinition,
  type ParsedCatalogDefinition,
} from "@/lib/catalog-schema";
import {
  CatalogPreviewFrame,
  CatalogPreviewWidthControl,
  type CatalogPreviewWidthId,
} from "./catalog-preview-frame";
import { CatalogThemePreview } from "./catalog-theme-preview";

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
 * Renders the stored payload through the production renderer, inside the same
 * frame the editor uses, so the review route and the editor cannot drift.
 */
export function CatalogPreviewSurface({ item }: { readonly item: CatalogItem }) {
  const [widthId, setWidthId] = useState<CatalogPreviewWidthId>("fit");
  const parsed = useMemo(
    () => parseCatalogDefinition(item.kind, item.definition),
    [item.kind, item.definition]
  );

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
      <CatalogPreviewWidthControl widthId={widthId} onWidthChange={setWidthId} />
      <CatalogPreviewFrame widthId={widthId}>
        <PreviewPayload parsed={parsed.parsed} />
      </CatalogPreviewFrame>
    </div>
  );
}
