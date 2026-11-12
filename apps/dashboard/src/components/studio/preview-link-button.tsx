"use client";

import React, { useState } from "react";
import { Button } from "@suite/ui";
import { EyeIcon } from "@suite/ui/icons";
import { createSitePreviewLink, describeCmsError } from "@/lib/api/site-client";

const POPUP_BLOCKED_MESSAGE =
  "The preview opened in a blocked window. Allow pop-ups for this site and try again.";

interface PreviewLinkButtonProps {
  readonly siteId: string;
  readonly path: string;
}

/**
 * Opens a signed, expiring storefront link for the current draft (FR-037).
 * The link is minted by the API with the session and the preview capability;
 * the browser never composes or signs it.
 */
export function PreviewLinkButton({ siteId, path }: PreviewLinkButtonProps) {
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPreview(): Promise<void> {
    setIsOpening(true);
    setError(null);
    try {
      const link = await createSitePreviewLink(siteId, path);
      const opened = window.open(link.url, "_blank", "noopener,noreferrer");
      if (opened === null) {
        setError(POPUP_BLOCKED_MESSAGE);
      }
    } catch (cause: unknown) {
      setError(describeCmsError(cause));
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        isLoading={isOpening}
        startIcon={<EyeIcon size={14} />}
        onClick={() => void openPreview()}
        className="h-8 gap-1.5 text-xs"
      >
        Share preview
      </Button>
      {error === null ? null : (
        <span role="alert" className="max-w-56 text-right text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
