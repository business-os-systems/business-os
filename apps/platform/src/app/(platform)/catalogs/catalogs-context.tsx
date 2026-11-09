"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Catalog, CatalogValue } from "@/lib/catalogs-api";

export interface CatalogsContextValue {
  readonly catalogs: readonly Catalog[];
  readonly applyValue: (catalogKey: string, value: CatalogValue) => void;
  readonly reload: () => void;
}

const CatalogsContext = createContext<CatalogsContextValue | null>(null);

/** The layout fetches the catalog list once; panels never refetch it (H-3.11). */
export function CatalogsProvider({
  value,
  children,
}: {
  readonly value: CatalogsContextValue;
  readonly children: ReactNode;
}) {
  return (
    <CatalogsContext.Provider value={value}>
      {children}
    </CatalogsContext.Provider>
  );
}

export function useCatalogsContext(): CatalogsContextValue {
  const value = useContext(CatalogsContext);
  if (value === null) {
    throw new Error("useCatalogsContext must be used inside CatalogsProvider");
  }
  return value;
}
