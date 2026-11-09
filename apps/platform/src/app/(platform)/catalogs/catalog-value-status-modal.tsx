"use client";

import { useId } from "react";
import { Button, Modal } from "@suite/ui";
import type { Catalog, CatalogValue } from "@/lib/catalogs-api";
import { CatalogValueStatusForm } from "./catalog-value-status-form";
import {
  catalogValueStatusMode,
  useCatalogStatusForm,
  type CatalogValueStatusMode,
} from "./use-catalog-status-form";

interface StatusModePresentation {
  readonly title: (code: string) => string;
  readonly description: string;
  readonly actionLabel: string;
  readonly buttonVariant: "destructive" | "secondary";
}

const STATUS_MODES = {
  retire: {
    title: (code: string) => `Retire ${code}`,
    description:
      "Retiring keeps existing records readable but removes the value from every application picker.",
    actionLabel: "Retire value",
    buttonVariant: "destructive",
  },
  reactivate: {
    title: (code: string) => `Reactivate ${code}`,
    description:
      "Reactivating makes this value selectable again in every application, within sixty seconds.",
    actionLabel: "Reactivate value",
    buttonVariant: "secondary",
  },
} as const satisfies Record<CatalogValueStatusMode, StatusModePresentation>;

interface CatalogValueStatusModalProps {
  readonly catalog: Catalog;
  readonly value: CatalogValue;
  readonly onClose: () => void;
  readonly onSaved: (value: CatalogValue) => void;
  readonly onReload: () => void;
}

export function CatalogValueStatusModal({
  catalog,
  value,
  onClose,
  onSaved,
  onReload,
}: CatalogValueStatusModalProps) {
  const formId = useId();
  const mode = catalogValueStatusMode(value);
  const presentation = STATUS_MODES[mode];
  const form = useCatalogStatusForm(catalog, value, mode, onSaved);

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!form.mutation.isSaving) onClose();
      }}
      title={presentation.title(value.code)}
      description={presentation.description}
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
            variant={presentation.buttonVariant}
            isLoading={form.mutation.isSaving}
            disabled={form.mutation.isSaving}
          >
            {presentation.actionLabel}
          </Button>
        </div>
      }
    >
      <CatalogValueStatusForm
        mode={mode}
        code={value.code}
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
