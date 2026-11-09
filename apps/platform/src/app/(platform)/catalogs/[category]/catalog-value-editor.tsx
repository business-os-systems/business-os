"use client";

import { Button } from "@suite/ui";
import { createCatalogValueTableConfig } from "@/components/catalogs/catalogs.config";
import { ConfigTable } from "@/components/tables/config-table";
import type { Catalog, CatalogValue } from "@/lib/catalogs-api";
import { CatalogValueModal } from "../catalog-value-modal";
import { CatalogValueStatusModal } from "../catalog-value-status-modal";
import { useCatalogsContext } from "../catalogs-context";
import type { CatalogDialog } from "./use-catalog-editor";
import { useCatalogEditor } from "./use-catalog-editor";

function EditorDialog({
  catalog,
  dialog,
  onClose,
  onSaved,
  onReload,
}: {
  readonly catalog: Catalog;
  readonly dialog: CatalogDialog;
  readonly onClose: () => void;
  readonly onSaved: (value: CatalogValue) => void;
  readonly onReload: () => void;
}) {
  if (dialog.kind === "status") {
    return (
      <CatalogValueStatusModal
        catalog={catalog}
        value={dialog.value}
        onClose={onClose}
        onSaved={onSaved}
        onReload={onReload}
      />
    );
  }
  return (
    <CatalogValueModal
      catalog={catalog}
      value={dialog.kind === "edit" ? dialog.value : null}
      onClose={onClose}
      onSaved={onSaved}
      onReload={onReload}
    />
  );
}

export function CatalogValueEditor({ catalog }: { readonly catalog: Catalog }) {
  const { applyValue, reload } = useCatalogsContext();
  const editor = useCatalogEditor(catalog, applyValue);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Reference catalog
          </p>
          <h1 className="text-2xl font-semibold">{catalog.label}</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            {catalog.description ??
              "Database-owned reference values shared by every application."}
          </p>
        </div>
        <Button onClick={editor.openCreate}>Add value</Button>
      </div>
      <ConfigTable
        config={createCatalogValueTableConfig(editor.actions)}
        rows={catalog.values}
        state={{ kind: "ready" }}
        rowKey={(row) => row.code}
        rowLabel={(row) => row.code}
        onRowClick={editor.actions.onEdit}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {editor.announcement ?? ""}
      </p>
      {editor.dialog === null ? null : (
        <EditorDialog
          catalog={catalog}
          dialog={editor.dialog}
          onClose={editor.close}
          onSaved={editor.saved}
          onReload={() => {
            editor.close();
            reload();
          }}
        />
      )}
    </div>
  );
}
