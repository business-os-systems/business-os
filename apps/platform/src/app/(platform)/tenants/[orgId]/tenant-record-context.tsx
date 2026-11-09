"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { TenantRecord } from "@/lib/tenant-api";

export interface TenantRecordContextValue {
  readonly record: TenantRecord;
  readonly reload: () => void;
}

const TenantRecordContext = createContext<TenantRecordContextValue | null>(null);

export function TenantRecordProvider({
  value,
  children,
}: {
  readonly value: TenantRecordContextValue;
  readonly children: ReactNode;
}) {
  return (
    <TenantRecordContext.Provider value={value}>
      {children}
    </TenantRecordContext.Provider>
  );
}

export function useTenantRecord(): TenantRecordContextValue {
  const value = useContext(TenantRecordContext);
  if (value === null) {
    throw new Error("useTenantRecord must be used inside the tenant record layout.");
  }
  return value;
}
