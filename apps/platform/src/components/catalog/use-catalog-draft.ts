"use client";

import { useState } from "react";
import type { CatalogItem, CatalogItemKind } from "@/lib/catalog-api";
import { writeDraftPath } from "@/lib/catalog-paths";
import {
  createCatalogDraft,
  draftFromItem,
  isBlockType,
  seedBlock,
  serializeCatalogDraft,
  validateCatalogDraft,
  type CatalogDraft,
  type CatalogIssue,
} from "@/lib/catalog-schema";
import { fieldValue, type CatalogFormField } from "./catalog-form.config";

const MAX_JSON_LENGTH = 256 * 1024;

export type CatalogEditorTarget =
  | { readonly mode: "create"; readonly kind: CatalogItemKind }
  | { readonly mode: "edit"; readonly item: CatalogItem };

export function catalogEditorKind(target: CatalogEditorTarget): CatalogItemKind {
  return target.mode === "edit" ? target.item.kind : target.kind;
}

function applyBlockType(current: CatalogDraft, blockType: string): CatalogDraft {
  if (!isBlockType(blockType)) {
    return current;
  }
  return writeDraftPath(current, "definition.block", seedBlock(blockType));
}

function applyField(
  current: CatalogDraft,
  field: CatalogFormField,
  input: string,
): CatalogDraft {
  if (field.control === "block-type") {
    return applyBlockType(current, input);
  }
  return writeDraftPath(current, field.path, fieldValue(field, input));
}

function parseJsonDraft(
  kind: CatalogItemKind,
  text: string,
): { readonly ok: true; readonly draft: CatalogDraft } | { readonly ok: false; readonly issues: readonly CatalogIssue[] } {
  if (text.length > MAX_JSON_LENGTH) {
    return { ok: false, issues: [{ path: "", message: "The JSON payload is too large." }] };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The JSON could not be parsed.";
    return { ok: false, issues: [{ path: "", message: `Invalid JSON: ${message}` }] };
  }
  const validation = validateCatalogDraft(kind, value);
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  return { ok: true, draft: validation.draft };
}

/** Draft, JSON text and the one validation path they share (FR-147, FR-148). */
export function useCatalogDraft(target: CatalogEditorTarget) {
  const kind = catalogEditorKind(target);
  const [draft, setDraft] = useState<CatalogDraft>(() =>
    target.mode === "edit" ? draftFromItem(target.item) : createCatalogDraft(target.kind),
  );
  const [issues, setIssues] = useState<readonly CatalogIssue[]>([]);
  const [jsonText, setJsonText] = useState(() => serializeCatalogDraft(draft));
  const [isJsonInvalid, setIsJsonInvalid] = useState(false);

  function replaceDraft(next: CatalogDraft): void {
    setDraft(next);
    setJsonText(serializeCatalogDraft(next));
    setIssues([]);
    setIsJsonInvalid(false);
  }

  function updateField(field: CatalogFormField, value: string): void {
    replaceDraft(applyField(draft, field, value));
  }

  function applyJson(text: string): void {
    setJsonText(text);
    const parsed = parseJsonDraft(kind, text);
    if (!parsed.ok) {
      setIssues(parsed.issues);
      setIsJsonInvalid(true);
      return;
    }
    replaceDraft(parsed.draft);
  }

  return {
    draft,
    issues,
    setIssues,
    jsonText,
    setJsonText,
    replaceDraft,
    updateField,
    applyJson,
    isJsonInvalid,
  };
}
