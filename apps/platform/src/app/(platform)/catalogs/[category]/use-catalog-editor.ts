"use client";

import { useState } from "react";
import type { CatalogValueActions } from "@/components/catalogs/catalogs.config";
import type { Catalog, CatalogValue } from "@/lib/catalogs-api";

export type CatalogDialog =
  | { readonly kind: "create" }
  | { readonly kind: "edit"; readonly value: CatalogValue }
  | { readonly kind: "status"; readonly value: CatalogValue };

export interface CatalogEditorState {
  readonly dialog: CatalogDialog | null;
  readonly announcement: string | null;
  readonly actions: CatalogValueActions;
  readonly openCreate: () => void;
  readonly close: () => void;
  readonly saved: (value: CatalogValue) => void;
}

export function useCatalogEditor(
  catalog: Catalog,
  applyValue: (catalogKey: string, value: CatalogValue) => void,
): CatalogEditorState {
  const [dialog, setDialog] = useState<CatalogDialog | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const actions: CatalogValueActions = {
    onEdit: (value) => setDialog({ kind: "edit", value }),
    onToggleStatus: (value) => setDialog({ kind: "status", value }),
  };

  function close(): void {
    setDialog(null);
  }

  function saved(value: CatalogValue): void {
    applyValue(catalog.key, value);
    setAnnouncement(
      `${value.code} saved. Every application observes the change within sixty seconds.`,
    );
    setDialog(null);
  }

  return {
    dialog,
    announcement,
    actions,
    openCreate: () => setDialog({ kind: "create" }),
    close,
    saved,
  };
}
