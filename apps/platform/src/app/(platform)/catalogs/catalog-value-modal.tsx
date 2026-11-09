"use client";

import { useId } from "react";
import { Button, Modal } from "@suite/ui";
import { getCatalogDefinition } from "@suite/core";
import type { Catalog, CatalogValue } from "@/lib/catalogs-api";
import { CatalogValueForm } from "./catalog-value-form";
import { useCatalogValueForm } from "./use-catalog-value-form";

interface CatalogValueModalProps {
  readonly catalog: Catalog;
  readonly value: CatalogValue | null;
  readonly onClose: () => void;
  readonly onSaved: (value: CatalogValue) => void;
  readonly onReload: () => void;
}

function modalTitle(catalog: Catalog, value: CatalogValue | null): string {
  return value === null ? `Add ${catalog.label} value` : `Edit ${value.code}`;
}

export function CatalogValueModal({
  catalog,
  value,
  onClose,
  onSaved,
  onReload,
}: CatalogValueModalProps) {
  const formId = useId();
  const form = useCatalogValueForm(catalog, value, onSaved);
  const definition = getCatalogDefinition(catalog.key);

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!form.mutation.isSaving) onClose();
      }}
      title={modalTitle(catalog, value)}
      description={`${definition.description} Codes are validated against this standard and normalized on save.`}
      size="xl"
      contentClassName="overflow-visible"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={form.mutation.isSaving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            isLoading={form.mutation.isSaving}
            disabled={form.mutation.isSaving}
          >
            {value === null ? "Add value" : "Save changes"}
          </Button>
        </div>
      }
    >
      <CatalogValueForm
        value={value}
        form={form}
        formId={formId}
        onReload={() => {
          onClose();
          onReload();
        }}
      />
    </Modal>
  );
}
