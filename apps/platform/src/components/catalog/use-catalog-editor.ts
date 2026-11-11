"use client";

import { useState } from "react";
import type { CatalogItem } from "@/lib/catalog-api";
import { catalogBlockType } from "@/lib/catalog-schema";
import { catalogFormFields } from "./catalog-form.config";
import { readTokens, withTokenValue, withoutToken } from "./catalog-token-operations";
import {
  catalogEditorKind,
  useCatalogDraft,
  type CatalogEditorTarget,
} from "./use-catalog-draft";
import { useCatalogSave } from "./use-catalog-save";

export type { CatalogEditorTarget } from "./use-catalog-draft";

export const CATALOG_EDITOR_TABS = ["form", "json"] as const;
export type CatalogEditorTab = (typeof CATALOG_EDITOR_TABS)[number];

interface CatalogEditorInput {
  readonly appId: string;
  readonly target: CatalogEditorTarget;
  readonly onSaved: (item: CatalogItem) => void;
}

/** Form schema, draft/JSON state and the save lifecycle for one editor. */
export function useCatalogEditor(input: CatalogEditorInput) {
  const kind = catalogEditorKind(input.target);
  const state = useCatalogDraft(input.target);
  const [tab, setTab] = useState<CatalogEditorTab>("form");
  const save = useCatalogSave({
    appId: input.appId,
    target: input.target,
    onSaved: input.onSaved,
    onIssues: (issues) => state.setIssues(issues),
  });
  const blockType = catalogBlockType(state.draft);
  const fields = catalogFormFields(state.draft.kind, blockType);

  function setToken(key: string, value: string): void {
    state.replaceDraft(withTokenValue(state.draft, key, value));
  }

  function removeToken(key: string): void {
    state.replaceDraft(withoutToken(state.draft, key));
  }

  function saveDraft(): Promise<void> {
    if (state.isJsonInvalid) {
      state.setIssues([
        { path: "", message: "Apply the JSON changes before saving the draft." },
      ]);
      return Promise.resolve();
    }
    return save.save(state.draft);
  }

  return {
    kind,
    draft: state.draft,
    fields,
    blockType,
    issues: state.issues,
    tab,
    setTab,
    jsonText: state.jsonText,
    setJsonText: state.setJsonText,
    updateField: state.updateField,
    applyJson: state.applyJson,
    save: saveDraft,
    setToken,
    removeToken,
    tokens: readTokens(state.draft),
    isSaving: save.isSaving,
    serverError: save.serverError,
  };
}
