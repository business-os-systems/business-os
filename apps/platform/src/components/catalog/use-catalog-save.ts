"use client";

import {
  createCatalogItem,
  updateCatalogItem,
  type CatalogItem,
} from "@/lib/catalog-api";
import {
  toCreateCatalogItemBody,
  toUpdateCatalogItemBody,
  validateCatalogDraft,
  type CatalogDraft,
  type CatalogIssue,
} from "@/lib/catalog-schema";
import { readInvalidParams } from "@/lib/problem-error";
import { useIdempotentMutation } from "@/lib/use-idempotent-mutation";
import { catalogEditorKind, type CatalogEditorTarget } from "./use-catalog-draft";

interface CatalogSaveInput {
  readonly appId: string;
  readonly target: CatalogEditorTarget;
  readonly onSaved: (item: CatalogItem) => void;
  readonly onIssues: (issues: readonly CatalogIssue[]) => void;
}

function serverIssues(cause: unknown): CatalogIssue[] {
  return readInvalidParams(cause).map((issue) => ({
    path: issue.name,
    message: issue.reason,
  }));
}

/** Validates once, then creates a draft or updates the open draft. */
export function useCatalogSave(input: CatalogSaveInput) {
  const mutation = useIdempotentMutation();

  async function save(draft: CatalogDraft): Promise<void> {
    const validation = validateCatalogDraft(catalogEditorKind(input.target), draft);
    if (!validation.ok) {
      input.onIssues(validation.issues);
      return;
    }
    const outcome = await mutation.run(async (idempotencyKey) => {
      if (input.target.mode === "edit") {
        return updateCatalogItem({
          appId: input.appId,
          itemId: input.target.item.id,
          body: toUpdateCatalogItemBody(validation.draft, input.target.item.concurrencyVersion),
          idempotencyKey,
        });
      }
      return createCatalogItem({
        appId: input.appId,
        body: toCreateCatalogItemBody(validation.draft),
        idempotencyKey,
      });
    }, input.onSaved);
    if (!outcome.ok) {
      const mapped = serverIssues(outcome.error);
      if (mapped.length > 0) {
        input.onIssues(mapped);
      }
    }
  }

  return { save, isSaving: mutation.isSaving, serverError: mutation.error };
}
