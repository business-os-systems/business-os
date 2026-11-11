"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appRecordPreviewHref } from "@/components/layout/app-record-nav.config";
import { createIdempotencyKey } from "@/lib/api";
import {
  transitionCatalogItem,
  type CatalogItem,
  type CatalogLifecycleAction,
} from "@/lib/catalog-api";
import { toMessage } from "@/lib/error-message";
import { createCatalogActions } from "./catalog-list.config";

interface CatalogPanelActionsInput {
  readonly appId: string;
  readonly upsertItem: (item: CatalogItem) => void;
  readonly onEdit: (item: CatalogItem) => void;
}

/** Row actions: navigate to preview, open the editor, or run a lifecycle move. */
export function useCatalogPanelActions(input: CatalogPanelActionsInput) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);

  async function transition(item: CatalogItem, action: CatalogLifecycleAction): Promise<void> {
    setActionError(null);
    try {
      const updated = await transitionCatalogItem({
        appId: input.appId,
        itemId: item.id,
        action,
        idempotencyKey: createIdempotencyKey(),
      });
      input.upsertItem(updated);
    } catch (cause) {
      setActionError(toMessage(cause));
    }
  }

  const actions = createCatalogActions({
    onPreview: (item) => router.push(appRecordPreviewHref(input.appId, item.id)),
    onEdit: input.onEdit,
    onTransition: (item, action) => void transition(item, action),
  });

  return { actionError, actions };
}
