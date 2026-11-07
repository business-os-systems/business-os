"use client";

import { useId } from "react";
import { Button, Modal } from "@suite/ui";
import type { CatalogApp } from "@/lib/apps-api";
import { CatalogOverrideForm } from "./catalog-override-form";
import { useCatalogOverrideForm } from "./use-catalog-override-form";

interface CatalogOverrideModalProps {
  readonly app: CatalogApp;
  readonly onClose: () => void;
  readonly onSaved: (app: CatalogApp) => void;
  readonly onReload: () => void;
}

export function CatalogOverrideModal({
  app,
  onClose,
  onSaved,
  onReload,
}: CatalogOverrideModalProps) {
  const formId = useId();
  const form = useCatalogOverrideForm(app, onSaved);

  return (
    <Modal
      isOpen
      onClose={() => {
        if (!form.mutation.isSaving) onClose();
      }}
      title={`Catalog override — ${app.title}`}
      description="Availability, display order and category are operational overrides. Hiding an app never disables it for tenants that already installed it."
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
            Save override
          </Button>
        </div>
      }
    >
      <CatalogOverrideForm
        app={app}
        formId={formId}
        form={form}
        onClose={onClose}
        onReload={onReload}
      />
    </Modal>
  );
}
