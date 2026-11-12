"use client";

import React, { useState } from "react";
import { Button } from "@suite/ui";
import { describeCmsError, exportSiteRequest } from "@/lib/api/site-client";
import type { SiteExportDocument } from "@/lib/api/site-export.contract";

function documentFileName(siteSlug: string): string {
  return siteSlug + "-site-export.json";
}

function saveDocument(document: SiteExportDocument, siteSlug: string): void {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = documentFileName(siteSlug);
  anchor.rel = "noopener";
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

interface ExportSiteButtonProps {
  readonly siteId: string;
  readonly siteSlug: string;
}

/**
 * Downloads the workspace's own site in the portable export format (SC-012).
 * The file is validated against the export contract before it is offered, and
 * a server refusal is shown verbatim (RFC 7807).
 */
export function ExportSiteButton({ siteId, siteSlug }: ExportSiteButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exportCurrentSite(): Promise<void> {
    setIsExporting(true);
    setError(null);
    try {
      saveDocument(await exportSiteRequest(siteId), siteSlug);
    } catch (cause: unknown) {
      setError(describeCmsError(cause));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        isLoading={isExporting}
        onClick={() => void exportCurrentSite()}
        aria-label={"Export " + siteSlug + " as JSON"}
      >
        Export
      </Button>
      {error === null ? null : (
        <span role="alert" className="max-w-48 text-right text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
