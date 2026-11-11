import React from "react";
import type { MediaUsageView } from "@suite/media/react";

function UsageLocation({ usage }: { readonly usage: MediaUsageView }) {
  const publishedLabel = usage.status === "PUBLISHED" ? "Published" : "Draft";
  return (
    <li className="rounded-lg border border-border bg-surface-muted p-3">
      <p className="text-xs font-semibold text-text">
        {usage.appId} / {usage.resourceType}
      </p>
      <p className="mt-0.5 text-xs text-text-secondary">
        {usage.resourceId}
        {usage.subKey.length > 0 ? `#${usage.subKey}` : ""}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold text-text-secondary">
        {publishedLabel}
      </p>
    </li>
  );
}

export function MediaUsageList({
  usages,
}: {
  readonly usages: readonly MediaUsageView[];
}) {
  if (usages.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-text-muted">
        This asset is not referenced by any content yet.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {usages.map((usage) => (
        <UsageLocation key={usage.id} usage={usage} />
      ))}
    </ul>
  );
}
