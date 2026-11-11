"use client";

import { Alert, Button, Modal } from "@suite/ui";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { CATALOG_KIND_LABELS, type CatalogItem } from "@/lib/catalog-api";
import { canAuthorApps } from "@/lib/capability";
import { CatalogForm } from "./catalog-form";
import { CatalogJsonTab } from "./catalog-json-tab";
import { CatalogTokenEditor } from "./catalog-token-editor";
import {
  CATALOG_EDITOR_TABS,
  useCatalogEditor,
  type CatalogEditorTab,
  type CatalogEditorTarget,
} from "./use-catalog-editor";

const TAB_LABELS: Readonly<Record<CatalogEditorTab, string>> = {
  form: "Form",
  json: "JSON",
};

interface CatalogEditorModalProps {
  readonly appId: string;
  readonly target: CatalogEditorTarget;
  readonly onClose: () => void;
  readonly onSaved: (item: CatalogItem) => void;
}

function targetKind(target: CatalogEditorTarget) {
  return target.mode === "edit" ? target.item.kind : target.kind;
}

function EditorTabBar({
  tab,
  onChange,
}: {
  readonly tab: CatalogEditorTab;
  readonly onChange: (tab: CatalogEditorTab) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Editor mode">
      {CATALOG_EDITOR_TABS.map((candidate) => (
        <Button
          key={candidate}
          type="button"
          size="sm"
          variant={tab === candidate ? "default" : "secondary"}
          aria-pressed={tab === candidate}
          onClick={() => onChange(candidate)}
        >
          {TAB_LABELS[candidate]}
        </Button>
      ))}
    </div>
  );
}

function EditorBody({
  allowed,
  kind,
  editor,
}: {
  readonly allowed: boolean;
  readonly kind: ReturnType<typeof targetKind>;
  readonly editor: ReturnType<typeof useCatalogEditor>;
}) {
  const disabled = !allowed || editor.isSaving;
  return (
    <div className="space-y-3">
      <EditorTabBar tab={editor.tab} onChange={editor.setTab} />
      {editor.serverError === null ? null : (
        <Alert variant="error" title="The catalog change could not be saved" message={editor.serverError} />
      )}
      {editor.tab === "form" ? (
        <div className="space-y-4">
          <CatalogForm
            fields={editor.fields}
            draft={editor.draft}
            issues={editor.issues.filter((issue) => !issue.path.startsWith("definition.tokens"))}
            disabled={disabled}
            formId={`catalog-${kind.toLowerCase()}-form`}
            onChange={editor.updateField}
          />
          {kind === "THEME" ? (
            <CatalogTokenEditor
              tokens={editor.tokens}
              issues={editor.issues}
              disabled={disabled}
              onAdd={editor.setToken}
              onChange={editor.setToken}
              onRemove={editor.removeToken}
            />
          ) : null}
        </div>
      ) : (
        <CatalogJsonTab
          text={editor.jsonText}
          issues={editor.issues}
          disabled={disabled}
          onChange={editor.setJsonText}
          onApply={() => editor.applyJson(editor.jsonText)}
        />
      )}
    </div>
  );
}

export function CatalogEditorModal({
  appId,
  target,
  onClose,
  onSaved,
}: CatalogEditorModalProps) {
  const editor = useCatalogEditor({ appId, target, onSaved });
  const { session } = usePlatformAuth();
  const allowed = canAuthorApps(session?.capabilities);
  const kind = targetKind(target);
  const kindLabel = CATALOG_KIND_LABELS[kind].toLowerCase();

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      title={target.mode === "edit" ? `Edit ${kindLabel}` : `New ${kindLabel}`}
      description="A catalog change stays a draft until it is previewed and published."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!allowed || editor.isSaving}
            onClick={() => void editor.save()}
          >
            {editor.isSaving ? "Saving..." : "Save draft"}
          </Button>
        </div>
      }
    >
      {allowed ? null : (
        <CapabilityDeniedView message="Your operator account cannot author catalog items." />
      )}
      <EditorBody allowed={allowed} kind={kind} editor={editor} />
    </Modal>
  );
}
