"use client";

import { useState } from "react";
import { Alert, Button, Modal } from "@suite/ui";
import { usePlatformAuth } from "@/components/auth/auth-provider";
import { CapabilityDeniedView } from "@/components/states/view-state";
import { CATALOG_KIND_LABELS, type CatalogItem } from "@/lib/catalog-api";
import { canAuthorApps } from "@/lib/capability";
import { CatalogForm } from "./catalog-form";
import { CatalogJsonTab } from "./catalog-json-tab";
import { CatalogDiscardDialog } from "./catalog-discard-dialog";
import { CatalogEditorSectionPane } from "./catalog-editor-section-pane";
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

function EditorInputs({
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

function editorTitle(target: CatalogEditorTarget, kindLabel: string): string {
  return target.mode === "edit" ? `Edit ${kindLabel}` : `New ${kindLabel}`;
}

function EditorFooter(props: {
  readonly canSave: boolean;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  return (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="button" variant="secondary" onClick={props.onCancel}>
        Cancel
      </Button>
      <Button type="button" disabled={!props.canSave || props.isSaving} onClick={props.onSave}>
        {props.isSaving ? "Saving..." : "Save draft"}
      </Button>
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
  const isSection = kind === "SECTION";
  const [isConfirmingClose, setIsConfirmingClose] = useState(false);

  function requestClose(): void {
    if (editor.isDirty) {
      setIsConfirmingClose(true);
      return;
    }
    onClose();
  }

  return (
    <Modal
      isOpen
      onClose={requestClose}
      size="xl"
      className="max-w-[min(96vw,1600px)]"
      title={editorTitle(target, kindLabel)}
      description="A catalog change stays a draft until it is previewed and published."
      footer={
        <EditorFooter
          canSave={allowed}
          isSaving={editor.isSaving}
          onCancel={requestClose}
          onSave={() => void editor.save()}
        />
      }
    >
      {allowed ? null : (
        <CapabilityDeniedView message="Your operator account cannot author catalog items." />
      )}

      <div className={isSection ? "grid gap-4 lg:grid-cols-[minmax(340px,420px)_1fr]" : "space-y-4"}>
        <div className={isSection ? "min-w-0 space-y-3 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-2" : "space-y-3"}>
          <EditorInputs allowed={allowed} kind={kind} editor={editor} />
        </div>
        {isSection ? (
          <div className="min-w-0">
            <CatalogEditorSectionPane appId={appId} draft={editor.draft} />
          </div>
        ) : null}
      </div>

      {isConfirmingClose ? (
        <CatalogDiscardDialog
          onKeepEditing={() => setIsConfirmingClose(false)}
          onDiscard={onClose}
        />
      ) : null}
    </Modal>
  );
}
