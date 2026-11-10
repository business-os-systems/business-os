"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CatalogApp } from "@/lib/apps-api";

export interface AppRecordContextValue {
  readonly app: CatalogApp;
  readonly reload: () => void;
}

const AppRecordContext = createContext<AppRecordContextValue | null>(null);

/**
 * The record is fetched once by the hub layout. Every panel reads this context,
 * so switching destinations never refetches the application (H-3.11).
 */
export function AppRecordProvider({
  value,
  children,
}: {
  readonly value: AppRecordContextValue;
  readonly children: ReactNode;
}) {
  return <AppRecordContext.Provider value={value}>{children}</AppRecordContext.Provider>;
}

export function useAppRecord(): AppRecordContextValue {
  const value = useContext(AppRecordContext);
  if (value === null) {
    throw new Error("useAppRecord must be used inside the application record.");
  }
  return value;
}
