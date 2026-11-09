"use client";

import { useState } from "react";
import type { ConfigFormErrors } from "@/components/forms/config-form.types";
import {
  buildCatalogValueStatusBody,
  validateRetireConfirmation,
  type RetireConfirmationValues,
} from "@/components/forms/catalog-value-form.config";
import {
  updateCatalogValue,
  type Catalog,
  type CatalogValue,
} from "@/lib/catalogs-api";
import { useCatalogMutation, type CatalogMutation } from "./use-catalog-mutation";

export type CatalogValueStatusMode = "retire" | "reactivate";

export function catalogValueStatusMode(
  value: CatalogValue,
): CatalogValueStatusMode {
  return value.isActive ? "retire" : "reactivate";
}

export interface CatalogStatusFormController {
  readonly values: RetireConfirmationValues;
  readonly errors: ConfigFormErrors<RetireConfirmationValues>;
  readonly mutation: CatalogMutation;
  readonly updateField: (
    name: keyof RetireConfirmationValues,
    next: string,
  ) => void;
  readonly submit: () => Promise<void>;
}

export function useCatalogStatusForm(
  catalog: Catalog,
  value: CatalogValue,
  mode: CatalogValueStatusMode,
  onSaved: (value: CatalogValue) => void,
): CatalogStatusFormController {
  const [values, setValues] = useState<RetireConfirmationValues>({
    confirmation: "",
  });
  const [errors, setErrors] = useState<
    ConfigFormErrors<RetireConfirmationValues>
  >({});
  const mutation = useCatalogMutation();

  function updateField(
    name: keyof RetireConfirmationValues,
    next: string,
  ): void {
    setValues((current) => ({ ...current, [name]: next }));
    setErrors({});
  }

  async function submit(): Promise<void> {
    if (mode === "retire") {
      const nextErrors = validateRetireConfirmation(values, value.code);
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        return;
      }
    }
    await mutation.run(
      () =>
        updateCatalogValue({
          catalogKey: catalog.key,
          code: value.code,
          body: buildCatalogValueStatusBody(!value.isActive, value.version),
        }),
      onSaved,
    );
  }

  return { values, errors, mutation, updateField, submit };
}
