import type { CatalogItem } from "@/lib/catalog-api";

export type CatalogPreviewRecordingState =
  | { readonly kind: "idle" }
  | { readonly kind: "recording" }
  | { readonly kind: "recorded"; readonly version: number; readonly expiresAt: string }
  | { readonly kind: "error"; readonly message: string };

export interface CatalogPublishError {
  readonly message: string;
  readonly previewRequired: boolean;
}

/** A version exists to preview when a draft is open or a published version can be republished. */
export function itemNeedsPreview(item: CatalogItem): boolean {
  return (
    item.draftVersion !== null ||
    item.status === "DEPRECATED" ||
    item.status === "DISABLED"
  );
}
