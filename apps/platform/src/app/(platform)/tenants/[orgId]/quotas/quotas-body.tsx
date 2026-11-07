"use client";

import { Alert, Button } from "@suite/ui";
import { PlatformViewState } from "@/components/states/view-state";
import {
  availableQuotaResources,
  overLimitCount,
} from "@/components/quotas/quotas.config";
import type { ViewProblem } from "@/lib/problem-view";
import type { QuotaItem } from "@/lib/quotas-api";
import { QuotaEditorModal } from "./quota-editor-modal";
import { QuotasTable } from "./quotas-table";
import { editorQuota, type QuotaEditorState } from "./use-quotas";

function QuotaEditorHost({
  orgId,
  items,
  editor,
  onClose,
  onSaved,
}: {
  readonly orgId: string;
  readonly items: readonly QuotaItem[];
  readonly editor: QuotaEditorState;
  readonly onClose: () => void;
  readonly onSaved: (items: readonly QuotaItem[]) => void;
}) {
  if (editor.mode === "closed") return null;
  return (
    <QuotaEditorModal
      orgId={orgId}
      quota={editorQuota(editor)}
      availableResources={availableQuotaResources(items)}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

interface QuotasBodyProps {
  readonly orgId: string;
  readonly items: readonly QuotaItem[] | null;
  readonly problem: ViewProblem | null;
  readonly editor: QuotaEditorState;
  readonly onOpen: (editor: QuotaEditorState) => void;
  readonly onClose: () => void;
  readonly onRetry: () => void;
  readonly onSaved: (items: readonly QuotaItem[]) => void;
}

export function QuotasBody({
  orgId,
  items,
  problem,
  editor,
  onOpen,
  onClose,
  onRetry,
  onSaved,
}: QuotasBodyProps) {
  if (problem !== null) {
    return (
      <PlatformViewState state={{ kind: "error", problem, onRetry }} />
    );
  }
  if (items === null) {
    return (
      <PlatformViewState state={{ kind: "loading", label: "Loading quotas..." }} />
    );
  }
  const overLimit = overLimitCount(items);
  return (
    <>
      {overLimit === 0 ? null : (
        <Alert
          variant="warning"
          title="This tenant is over a configured limit"
          message={`${overLimit} resource(s) exceed their limit. Existing content is preserved; new creation is refused until usage falls below the limit.`}
        />
      )}
      <QuotasTable items={items} onOpen={onOpen} />
      <div className="flex justify-end">
        <Button
          variant="secondary"
          disabled={availableQuotaResources(items).length === 0}
          onClick={() => onOpen({ mode: "create" })}
        >
          Add quota
        </Button>
      </div>
      <QuotaEditorHost
        orgId={orgId}
        items={items}
        editor={editor}
        onClose={onClose}
        onSaved={(saved) => {
          onSaved(saved);
          onClose();
        }}
      />
    </>
  );
}
