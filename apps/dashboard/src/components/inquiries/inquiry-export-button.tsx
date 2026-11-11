"use client";

import React, { useState } from "react";
import { Alert, Button } from "@suite/ui";
import { readProblemMessage } from "@/lib/problem-details";
import { INQUIRY_EXPORT_ACTION } from "./inquiries.config";
import type { InquiryFilters } from "./use-inquiry-list";

function buildExportUrl(filters: InquiryFilters): string {
  const params = new URLSearchParams();
  if (filters.status !== null) {
    params.set("status", filters.status);
  }
  if (filters.siteId !== null) {
    params.set("siteId", filters.siteId);
  }
  const search = params.toString();
  return search.length === 0
    ? INQUIRY_EXPORT_ACTION.path
    : INQUIRY_EXPORT_ACTION.path + "?" + search;
}

function safeFilename(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, "-");
  return sanitized.length === 0 ? INQUIRY_EXPORT_ACTION.filenameFallback : sanitized;
}

function filenameFromDisposition(value: string | null): string {
  const match = /filename="([^"]+)"/.exec(value ?? "");
  return safeFilename(match?.[1] ?? INQUIRY_EXPORT_ACTION.filenameFallback);
}

function saveCsvFile(csv: Blob, filename: string): void {
  const url = URL.createObjectURL(csv);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Exports the currently filtered inquiries (FR-047). Rendering is gated by the
 * caller because the file carries personal data; a refusal shows the genuine
 * RFC 7807 detail instead of a generic network message.
 */
export function InquiryExportButton({ filters }: { readonly filters: InquiryFilters }) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setIsExporting(true);
    setError(null);
    try {
      const response = await fetch(buildExportUrl(filters), {
        headers: { accept: "text/csv" },
        cache: "no-store",
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        throw new Error(
          readProblemMessage(body) ??
            "The inquiry export failed with status " + response.status + "."
        );
      }
      saveCsvFile(
        await response.blob(),
        filenameFromDisposition(response.headers.get("content-disposition"))
      );
    } catch (exportError: unknown) {
      setError(toMessage(exportError));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        variant="secondary"
        size="sm"
        isLoading={isExporting}
        onClick={() => void handleExport()}
      >
        {isExporting ? INQUIRY_EXPORT_ACTION.loadingLabel : INQUIRY_EXPORT_ACTION.label}
      </Button>
      {error === null ? null : (
        <Alert variant="error" title={INQUIRY_EXPORT_ACTION.errorTitle} message={error} />
      )}
    </div>
  );
}
