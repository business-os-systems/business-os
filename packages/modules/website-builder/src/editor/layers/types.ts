import type { BlockAst } from "../../ast/types.js";

export interface CatalogSectionDefinition {
  readonly schemaVersion: string;
  readonly block: BlockAst;
}

/** One tenant-visible SECTION catalog row, already resolved for this workspace. */
export interface CatalogSection {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly industries: readonly string[];
  readonly currentVersion: number;
  readonly previewRef: string | null;
  readonly definition: CatalogSectionDefinition;
}

export type CatalogSectionsState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly sections: readonly CatalogSection[] };

export interface AddSectionDrawerProps {
  readonly isOpen: boolean;
  readonly catalog: CatalogSectionsState;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onInsert: (section: CatalogSection) => void;
}
